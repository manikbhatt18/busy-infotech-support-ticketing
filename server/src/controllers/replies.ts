import { Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role, Ticket, TicketCollaborator } from '@prisma/client';

type TicketWithCollaborators = Ticket & { collaborators: TicketCollaborator[] };
type JwtPayload = { userId: string; role: Role };

const canAgentActOnTicket = (user: JwtPayload, ticket: TicketWithCollaborators): boolean => {
  if (user.role === 'SUPERVISOR') return true;
  const isAssignee = ticket.primaryAssigneeId === user.userId;
  const isCollaborator = ticket.collaborators?.some((c) => c.userId === user.userId);
  return isAssignee || isCollaborator;
};

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

    // Goal 4 integration point explicitly deferred:
    // createReply does NOT touch ticket.status or pendingEnteredAt.
    // The Pending->Open transition on customer reply is fully deferred to Goal 4.

    const newReply = await prisma.$transaction(async (tx) => {
      const reply = await tx.reply.create({
        data: {
          ticketId,
          body: data.body,
          isInternal: data.isInternal,
          authorType: data.authorType,
          // Explicit authorId assignment rules:
          authorId: data.authorType === 'AGENT' ? user.userId : null,
        },
        include: {
          author: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      await tx.auditTimeline.create({
        data: {
          ticketId,
          actorId: user.userId, // AuditTimeline.actorId is ALWAYS the submitting agent
          eventType: 'REPLY_ADDED',
          replyId: reply.id,
        },
      });

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
