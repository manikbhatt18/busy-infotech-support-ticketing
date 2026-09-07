import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { canAgentActOnTicket } from './tickets';

// Near-breach threshold: 30 minutes (consistent with TicketDetailsModal's urgentThresholdMs)
const NEAR_BREACH_MS = 30 * 60 * 1000;

/**
 * Since Prisma can't do `WHERE NOT EXISTS (... AND breachTime = Ticket.slaTargetAt)` in a
 * single query (no cross-column references), we fetch all breaching tickets with their
 * acknowledgments and filter in JS. At the scale of active breaching tickets (typically
 * single/double digits), this is perfectly fine.
 */

// --- GET /sla-alerts ---
export const getSlaAlerts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const now = new Date();
    const nearBreachCutoff = new Date(now.getTime() + NEAR_BREACH_MS);

    const andConditions: any[] = [
      { slaTargetAt: { not: null } },
      { status: { notIn: ['RESOLVED', 'CLOSED', 'PENDING'] } },
      { slaTargetAt: { lt: nearBreachCutoff } },
      { isArchived: false },
    ];

    if (user.role === 'AGENT') {
      andConditions.push({
        OR: [
          { primaryAssigneeId: user.userId },
          { collaborators: { some: { userId: user.userId } } },
        ],
      });
    }

    const where = { AND: andConditions };

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        primaryAssignee: { select: { id: true, name: true, email: true } },
        slaAcks: {
          where: { agentId: user.userId },
          select: { breachTime: true },
        },
      },
      orderBy: { slaTargetAt: 'asc' }, // Most overdue first
    });

    // Filter out tickets where the user has already acknowledged THIS specific breach instance
    const alerts = tickets.filter((t) => {
      if (!t.slaTargetAt) return false;
      const acked = t.slaAcks.some(
        (ack) => ack.breachTime.getTime() === t.slaTargetAt!.getTime()
      );
      return !acked;
    });

    const result = alerts.map((t) => {
      const slaTargetAt = t.slaTargetAt!;
      const diffMs = slaTargetAt.getTime() - now.getTime();
      const isBreached = diffMs <= 0;

      let timeLabel: string;
      if (isBreached) {
        const overdueMs = Math.abs(diffMs);
        const overdueH = Math.floor(overdueMs / (1000 * 60 * 60));
        const overdueM = Math.floor((overdueMs % (1000 * 60 * 60)) / (1000 * 60));
        timeLabel = overdueH > 0
          ? `Overdue by ${overdueH}h ${overdueM}m`
          : `Overdue by ${overdueM}m`;
      } else {
        const remainH = Math.floor(diffMs / (1000 * 60 * 60));
        const remainM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        timeLabel = remainH > 0
          ? `${remainH}h ${remainM}m until breach`
          : `${remainM}m until breach`;
      }

      return {
        ticketId: t.id,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        assigneeName: t.primaryAssignee?.name || 'Unassigned',
        assigneeEmail: t.primaryAssignee?.email || null,
        slaTargetAt: t.slaTargetAt,
        isBreached,
        timeLabel,
        createdAt: t.createdAt,
      };
    });

    res.json({ alerts: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- GET /sla-alerts/count ---
export const getSlaAlertCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const now = new Date();
    const nearBreachCutoff = new Date(now.getTime() + NEAR_BREACH_MS);

    const andConditions: any[] = [
      { slaTargetAt: { not: null } },
      { status: { notIn: ['RESOLVED', 'CLOSED', 'PENDING'] } },
      { slaTargetAt: { lt: nearBreachCutoff } },
      { isArchived: false },
    ];

    if (user.role === 'AGENT') {
      andConditions.push({
        OR: [
          { primaryAssigneeId: user.userId },
          { collaborators: { some: { userId: user.userId } } },
        ],
      });
    }

    const where = { AND: andConditions };

    // Fetch only slaTargetAt and acks to filter in JS (lightweight)
    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        slaTargetAt: true,
        slaAcks: {
          where: { agentId: user.userId },
          select: { breachTime: true },
        },
      },
    });

    const count = tickets.filter((t) => {
      if (!t.slaTargetAt) return false;
      return !t.slaAcks.some(
        (ack) => ack.breachTime.getTime() === t.slaTargetAt!.getTime()
      );
    }).length;

    res.json({ count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- POST /sla-alerts/:ticketId/acknowledge ---
export const acknowledgeSlaAlert = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ticketId = req.params.ticketId as string;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true },
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Permission check: agent must be assignee/collaborator, or user must be supervisor
    if (!canAgentActOnTicket(user, ticket)) {
      res.status(403).json({ error: 'You do not have permission to acknowledge this alert' });
      return;
    }

    if (!ticket.slaTargetAt) {
      res.status(422).json({ error: 'This ticket has no SLA target set' });
      return;
    }

    // Create the acknowledgment tied to this specific breach instance
    // The @@unique constraint on [ticketId, agentId, breachTime] prevents duplicates
    try {
      await prisma.slaAcknowledgment.create({
        data: {
          ticketId,
          agentId: user.userId,
          breachTime: ticket.slaTargetAt,
        },
      });
    } catch (err: any) {
      // If the unique constraint fires, this alert was already acknowledged
      if (err.code === 'P2002') {
        res.status(409).json({ error: 'This alert has already been acknowledged' });
        return;
      }
      throw err;
    }

    res.json({ acknowledged: true, ticketId, breachTime: ticket.slaTargetAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
