import { Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role, Ticket, TicketCollaborator } from '@prisma/client';
import {
  canAgentActOnTicket,
  computeSlaTargetAt,
  TicketWithCollaborators,
  JwtPayload,
} from './tickets';

// --- GET /tickets/:id/replies ---
export const getReplies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true },
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (!canAgentActOnTicket(user, ticket)) {
      res.status(403).json({ error: 'You do not have permission to view replies for this ticket' });
      return;
    }

    const replies = await prisma.reply.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    res.json(replies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- POST /tickets/:id/replies ---
const createReplySchema = z.object({
  body: z.string().min(1, 'Reply body is required'),
  isInternal: z.boolean().default(false),
  authorType: z.enum(['AGENT', 'CUSTOMER']),
}).refine(data => !(data.authorType === 'CUSTOMER' && data.isInternal === true), {
  message: "A customer reply can never be an internal note",
  path: ["isInternal"],
});

export const createReply = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { collaborators: true },
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (!canAgentActOnTicket(user, ticket)) {
      res.status(403).json({ error: 'You do not have permission to reply to this ticket' });
      return;
    }

    const data = createReplySchema.parse(req.body);

    // Goal 4 integration: the PENDING → OPEN auto-transition (if applicable), its SLA clock
    // resume math, and the STATUS_CHANGED audit entry all happen inside the SAME $transaction
    // as the reply creation. A crash anywhere rolls back everything — no reply saved with the
    // ticket stuck in PENDING.
    const shouldAutoTransition =
      data.authorType === 'CUSTOMER' && ticket.status === 'PENDING';

    const now = new Date();

    const newReply = await prisma.$transaction(async (tx) => {
      // 1. Create the Reply
      const reply = await tx.reply.create({
        data: {
          ticketId,
          body: data.body,
          isInternal: data.isInternal,
          authorType: data.authorType,
          // Decision 9/10: for AGENT replies force authorId = submitting user.
          // For CUSTOMER replies explicitly set null — never undefined.
          authorId: data.authorType === 'AGENT' ? user.userId : null,
        },
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      // 2. REPLY_ADDED audit entry (actorId = always the submitting agent, per Decision 10)
      await tx.auditTimeline.create({
        data: {
          ticketId,
          actorId: user.userId,
          eventType: 'REPLY_ADDED',
          replyId: reply.id,
        },
      });

      // 3. Goal 4: PENDING → OPEN auto-transition on customer reply.
      // SLA clock resume: push slaTargetAt forward by exactly the time spent in PENDING.
      if (shouldAutoTransition) {
        const pauseMs = ticket.pendingEnteredAt
          ? now.getTime() - ticket.pendingEnteredAt.getTime()
          : 0;
        const newSlaTargetAt = ticket.slaTargetAt
          ? new Date(ticket.slaTargetAt.getTime() + pauseMs)
          : computeSlaTargetAt(ticket.priority);

        await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status: 'OPEN',
            pendingEnteredAt: null,
            slaTargetAt: newSlaTargetAt,
          },
        });

        // 4. STATUS_CHANGED audit entry — inside the same transaction
        await tx.auditTimeline.create({
          data: {
            ticketId,
            actorId: user.userId, // AuditTimeline.actorId = who submitted the action, per Decision 10
            eventType: 'STATUS_CHANGED',
            oldStatus: 'PENDING',
            newStatus: 'OPEN',
          },
        });
      }

      return reply;
    });

    res.status(201).json(newReply);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};
