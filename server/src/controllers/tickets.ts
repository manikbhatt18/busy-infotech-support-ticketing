import { Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

import { Role, Ticket, TicketCollaborator, TicketStatus, TicketPriority } from '@prisma/client';

// --- Shared Permission Helper ---
type TicketWithCollaborators = Ticket & { collaborators: TicketCollaborator[] };
type JwtPayload = { userId: string; role: Role };

const canAgentActOnTicket = (user: JwtPayload, ticket: TicketWithCollaborators): boolean => {
  if (user.role === 'SUPERVISOR') return true;
  const isAssignee = ticket.primaryAssigneeId === user.userId;
  const isCollaborator = ticket.collaborators?.some((c) => c.userId === user.userId);
  return isAssignee || isCollaborator;
};

// --- Goal 4: SLA Constants ---
// Decision 14: Chosen SLA windows per priority. Spec left values to us; these match
// common support-industry standards (URGENT=1h, HIGH=4h, MEDIUM=24h, LOW=48h).
const SLA_HOURS: Record<TicketPriority, number> = {
  URGENT: 1,
  HIGH:   4,
  MEDIUM: 24,
  LOW:    48,
};

// Decision 14: 7-day closed-ticket reopening window. Spec says "a fixed window" and
// leaves the duration to us; 7 days gives supervisors and agents a full week to catch
// accidental closures.
const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Returns slaTargetAt = NOW + SLA_HOURS[priority]. */
const computeSlaTargetAt = (priority: TicketPriority): Date => {
  return new Date(Date.now() + SLA_HOURS[priority] * 60 * 60 * 1000);
};

// --- Goal 4: State Machine Transition Table ---
// Decision 11: Every legal transition is declared here. Any request not in this table
// is rejected with a human-readable message. Checked before any other logic runs.
// See docs/decisions.md Decision 11 for the full rationale of each row.
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW:      ['OPEN'],
  OPEN:     ['PENDING', 'RESOLVED'],
  PENDING:  ['OPEN'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED:   ['OPEN'],  // only within 7-day window, checked separately
};

const getTicketsQuerySchema = z.object({
  isArchived: z.string().optional().transform(val => val === 'true'),
  search: z.string().optional().transform(val => val || undefined),
  status: z.enum(['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  category: z.string().optional().transform(val => val || undefined),
  assigneeId: z.string().optional().transform(val => val || undefined),
  sortBy: z.enum(['createdAt', 'priority', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)).pipe(z.number().min(1)),
  limit: z.string().optional().transform(val => (val ? parseInt(val, 10) : 10)).pipe(z.number().min(1).max(100)),
});

// --- GET /tickets ---
export const getTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = getTicketsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.issues });
      return;
    }

    const {
      isArchived,
      search,
      status,
      priority,
      category,
      assigneeId,
      sortBy,
      sortOrder,
      page,
      limit,
    } = parsed.data;

    // Build the query securely
    // We use an AND array to combine base security constraints with user filters,
    // ensuring that multiple OR clauses don't silently overwrite each other.
    const andConditions: any[] = [];

    // Base filters
    andConditions.push({ isArchived: isArchived ?? false });

    // Agent security filter
    if (user.role === 'AGENT') {
      andConditions.push({
        OR: [
          { primaryAssigneeId: user.userId },
          { collaborators: { some: { userId: user.userId } } }
        ]
      });
    }

    // User-provided filters
    if (search) {
      andConditions.push({
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ]
      });
    }

    if (status) andConditions.push({ status });
    if (priority) andConditions.push({ priority });
    if (category) andConditions.push({ category }); // Exact match
    if (assigneeId) andConditions.push({ primaryAssigneeId: assigneeId });

    const where = { AND: andConditions };
    const orderBy = { [sortBy]: sortOrder };

    const skip = (page - 1) * limit;

    // Run count and query in parallel
    const [total, data] = await prisma.$transaction([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          primaryAssignee: { select: { id: true, name: true, email: true } },
          collaborators: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          },
        }
      })
    ]);

    res.json({
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- PATCH /tickets/:id/triage (Goal 1: Reassignment only) ---
const updateTicketTriageSchema = z.object({
  primaryAssigneeId: z.string().nullable().optional(),
});

export const updateTicketTriage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { primaryAssigneeId } = updateTicketTriageSchema.parse(req.body);

    const existingTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true }
    });

    if (!existingTicket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (!canAgentActOnTicket(user, existingTicket)) {
      res.status(403).json({ error: 'You do not have permission to act on this ticket' });
      return;
    }

    if (user.role === 'AGENT') {
      // Agents cannot reassign a ticket away from themselves
      if (primaryAssigneeId !== undefined && primaryAssigneeId !== user.userId) {
        res.status(403).json({ error: 'Agents cannot reassign a ticket away from themselves' });
        return;
      }
    }

    const oldAssigneeId = existingTicket.primaryAssigneeId;
    // Use !== undefined (not ??) so that null (unassign) is treated as a new value,
    // not silently collapsed to the current assignee. Without this fix, a supervisor
    // sending primaryAssigneeId: null would update the DB but skip the REASSIGNED audit
    // entry because null ?? existingValue === existingValue, making oldAssigneeId ===
    // newAssigneeId and isReassignment === false.
    const newAssigneeId = primaryAssigneeId !== undefined
      ? primaryAssigneeId
      : existingTicket.primaryAssigneeId;
    const isReassignment = oldAssigneeId !== newAssigneeId;

    const updatedTicket = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: ticketId },
        data: {
          ...(primaryAssigneeId !== undefined && { primaryAssigneeId }),
        },
        include: {
          primaryAssignee: { select: { id: true, name: true, email: true } },
          collaborators: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          },
        }
      });

      if (isReassignment) {
        await tx.auditTimeline.create({
          data: {
            ticketId,
            actorId: user.userId,
            eventType: 'REASSIGNED',
            oldAssigneeId,
            newAssigneeId,
          }
        });
      }

      return ticket;
    });

    res.json(updatedTicket);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues }); // standardized: use .issues everywhere
    } else {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// --- POST /tickets (Goal 2: Create) ---
const createTicketSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().min(1, 'Description is required'),
  requesterEmail: z.string().email('Invalid email'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  category: z.string().min(1, 'Category is required'),
  primaryAssigneeId: z.string().nullable().optional(),
});

export const createTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { primaryAssigneeId, ...data } = createTicketSchema.parse(req.body);

    const ticket = await prisma.$transaction(async (tx) => {
      const newTicket = await tx.ticket.create({
        data: {
          ...data,
          primaryAssigneeId: primaryAssigneeId || user.userId, // Decision 6: Auto-assign creator if unspecified
          slaTargetAt: computeSlaTargetAt(data.priority as TicketPriority), // Goal 4: Set SLA on creation
        },
        include: {
          primaryAssignee: { select: { id: true, name: true, email: true } },
          collaborators: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          },
        }
      });

      await tx.auditTimeline.create({
        data: {
          ticketId: newTicket.id,
          actorId: user.userId,
          eventType: 'TICKET_CREATED',
          newStatus: newTicket.status,
        },
      });

      return newTicket;
    });

    res.status(201).json(ticket);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// --- PUT /tickets/:id (Goal 2: Edit Details) ---
const updateTicketDetailsSchema = z.object({
  subject: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  requesterEmail: z.string().email().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  category: z.string().min(1).optional(),
});

export const updateTicketDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true }
    });

    if (!existingTicket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (!canAgentActOnTicket(user, existingTicket)) {
      res.status(403).json({ error: 'You do not have permission to edit this ticket' });
      return;
    }

    const data = updateTicketDetailsSchema.parse(req.body);

    // Goal 4 — Decision B (sub-case): Priority change while PENDING.
    // If priority changes AND ticket is currently PENDING, reset BOTH slaTargetAt = NOW + newWindow
    // AND pendingEnteredAt = NOW together.
    //
    // Why both must reset together:
    //   Example: ticket entered PENDING at T=0 with MEDIUM SLA (24h → target = T+24h).
    //   At T=10h, priority is upgraded to URGENT (1h window).
    //   If only slaTargetAt resets: slaTargetAt = T+10h+1h = T+11h. But pendingEnteredAt = T+0.
    //   When the ticket later leaves PENDING (at T=12h), resume math = slaTargetAt + (T+12h - T+0) = T+11h + 12h = T+23h.
    //   The full 12h pause duration is counted — but only 2h of it (T+10h to T+12h) happened
    //   under the new URGENT priority. The 10h before the priority change is double-counted,
    //   giving the ticket only 1h of its intended fresh URGENT window on resume.
    //   Correct fix: also reset pendingEnteredAt = NOW so the pause timer restarts cleanly
    //   from the moment of the priority change.
    const priorityChanged = data.priority !== undefined && data.priority !== existingTicket.priority;
    const isCurrentlyPending = existingTicket.status === 'PENDING';

    let extraUpdates: Record<string, unknown> = {};
    if (priorityChanged) {
      extraUpdates.slaTargetAt = computeSlaTargetAt(data.priority as TicketPriority);
      if (isCurrentlyPending) {
        // Reset the pause timer so resume math only counts pause time under the new priority
        extraUpdates.pendingEnteredAt = new Date();
      }
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { ...data, ...extraUpdates },
    });

    res.json(updatedTicket);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// --- PATCH /tickets/:id/archive (Goal 2) ---
export const archiveTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true }
    });

    if (!existingTicket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (!canAgentActOnTicket(user, existingTicket)) {
      res.status(403).json({ error: 'You do not have permission to archive this ticket' });
      return;
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { isArchived: true },
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- PATCH /tickets/:id/restore (Goal 2) ---
export const restoreTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const existingTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true }
    });

    if (!existingTicket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (!canAgentActOnTicket(user, existingTicket)) {
      res.status(403).json({ error: 'You do not have permission to restore this ticket' });
      return;
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { isArchived: false },
    });

    res.json(updatedTicket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- PATCH /tickets/:id/status (Goal 4: Lifecycle State Machine) ---
const updateTicketStatusSchema = z.object({
  status: z.enum(['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED']),
});

export const updateTicketStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // GUARD 1: Permission — checked before transition table, before any business logic.
    // An agent with no relationship to this ticket cannot attempt any status change.
    const existingTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true },
    });

    if (!existingTicket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (!canAgentActOnTicket(user, existingTicket)) {
      res.status(403).json({ error: 'You do not have permission to act on this ticket' });
      return;
    }

    const { status: newStatus } = updateTicketStatusSchema.parse(req.body);
    const currentStatus = existingTicket.status;

    // GUARD 2: Same-status request is explicitly rejected as an invalid transition.
    // Decision: treat it as an error (not a silent no-op) so callers cannot silently
    // send stale state. Error message is specific, not generic.
    if (currentStatus === newStatus) {
      res.status(422).json({
        error: `Ticket is already in status ${currentStatus}. No transition was made.`,
      });
      return;
    }

    // GUARD 3: Transition table — checked before any special-case logic.
    // Decision 11: every legal move is declared in ALLOWED_TRANSITIONS.
    const legalNextStates = ALLOWED_TRANSITIONS[currentStatus];
    if (!legalNextStates.includes(newStatus)) {
      res.status(422).json({
        error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed next states: ${legalNextStates.join(', ') || 'none'}.`,
      });
      return;
    }

    // GUARD 4: Role check — agents cannot set CLOSED.
    if (newStatus === 'CLOSED' && user.role === 'AGENT') {
      res.status(403).json({ error: 'Only supervisors can close tickets.' });
      return;
    }

    // GUARD 5: Reopening CLOSED ticket — must be within 7-day window.
    // Decision 13: any authorized agent (assignee/collaborator) or supervisor may reopen.
    if (currentStatus === 'CLOSED' && newStatus === 'OPEN') {
      const closedAt = existingTicket.closedAt;
      if (!closedAt || Date.now() - closedAt.getTime() > REOPEN_WINDOW_MS) {
        res.status(422).json({
          error: 'This ticket cannot be reopened. The 7-day reopening window has passed.',
        });
        return;
      }
    }

    // --- SLA clock math and timestamp bookkeeping ---
    const now = new Date();
    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === 'PENDING') {
      // Entering PENDING: start the pause timer.
      updateData.pendingEnteredAt = now;

    } else if (currentStatus === 'PENDING') {
      // Leaving PENDING: resume the SLA clock by pushing the deadline forward
      // by exactly how long the ticket was paused.
      const pauseMs = existingTicket.pendingEnteredAt
        ? now.getTime() - existingTicket.pendingEnteredAt.getTime()
        : 0;
      updateData.pendingEnteredAt = null;
      if (existingTicket.slaTargetAt) {
        updateData.slaTargetAt = new Date(existingTicket.slaTargetAt.getTime() + pauseMs);
      }
    }

    if (newStatus === 'RESOLVED') {
      updateData.resolvedAt = now;
    }
    if (newStatus === 'CLOSED') {
      updateData.closedAt = now;
    }

    // Reopening: clear resolved/closed timestamps so the fresh cycle starts clean.
    if (newStatus === 'OPEN' && (currentStatus === 'RESOLVED' || currentStatus === 'CLOSED')) {
      updateData.resolvedAt = null;
      updateData.closedAt = null;
      // Restore a fresh SLA window on reopen so the clock runs against the current priority.
      updateData.slaTargetAt = computeSlaTargetAt(existingTicket.priority);
    }

    // --- Commit status update + STATUS_CHANGED audit entry in one transaction ---
    const updatedTicket = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id: ticketId },
        data: updateData as any,
        include: {
          primaryAssignee: { select: { id: true, name: true, email: true } },
          collaborators: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          },
        },
      });

      await tx.auditTimeline.create({
        data: {
          ticketId,
          actorId: user.userId,
          eventType: 'STATUS_CHANGED',
          oldStatus: currentStatus,
          newStatus,
        },
      });

      return ticket;
    });

    res.json(updatedTicket);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Export shared helpers and constants for use in replies controller (Goal 4 integration)
export { ALLOWED_TRANSITIONS, SLA_HOURS, REOPEN_WINDOW_MS, computeSlaTargetAt, canAgentActOnTicket };
export type { TicketWithCollaborators, JwtPayload };
