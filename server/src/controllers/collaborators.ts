import { Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { Role } from '@prisma/client';

type JwtPayload = { userId: string; role: Role };

// Guard 1 Helper: Only SUPERVISOR or the primary assignee may manage collaborators.
// Collaborators themselves are intentionally excluded — allowing them to
// add/remove others would be a privilege-escalation path.
const canManageCollaborators = (
  user: JwtPayload,
  ticket: { primaryAssigneeId: string | null }
): boolean => {
  return user.role === 'SUPERVISOR' || ticket.primaryAssigneeId === user.userId;
};

const addCollaboratorSchema = z.object({
  userId: z.string(),
});

export const addCollaborator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parsed = addCollaboratorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }
    const { userId: targetUserId } = parsed.data;

    // Guard 0: Check if ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, primaryAssigneeId: true },
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Guard 1: Permission check
    if (!canManageCollaborators(user, ticket)) {
      res.status(403).json({ error: 'Only supervisors and the primary assignee can manage collaborators on this ticket' });
      return;
    }

    // Guard 3: No self-collaboration
    if (targetUserId === user.userId) {
      res.status(400).json({ error: 'You cannot add yourself as a collaborator' });
      return;
    }

    // Guard 4: Cannot add the primary assignee
    if (targetUserId === ticket.primaryAssigneeId) {
      res.status(400).json({ error: 'The primary assignee is already assigned to this ticket' });
      return;
    }

    // Guard 2: Explicitly check if the target user exists and is an AGENT
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Target user not found' });
      return;
    }
    if (targetUser.role !== 'AGENT') {
      res.status(400).json({ error: 'Only agents can be added as collaborators (Supervisors already have full access)' });
      return;
    }

    // Guard 5: Duplicate check
    const existingCollab = await prisma.ticketCollaborator.findUnique({
      where: { ticketId_userId: { ticketId, userId: targetUserId } },
    });
    if (existingCollab) {
      res.status(409).json({ error: 'User is already a collaborator on this ticket' });
      return;
    }

    // Execute insertion and audit log in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.ticketCollaborator.create({
        data: {
          ticketId,
          userId: targetUserId,
        },
      });

      await tx.auditTimeline.create({
        data: {
          ticketId,
          actorId: user.userId,
          eventType: 'COLLABORATOR_ADDED',
          collaboratorId: targetUserId,
        },
      });
    });

    // Return the updated ticket with the enriched collaborator list
    const updatedTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        primaryAssignee: { select: { id: true, name: true, email: true } },
        collaborators: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    res.status(200).json(updatedTicket);
  } catch (error) {
    console.error('Error adding collaborator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeCollaborator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;
    const targetUserId = req.params.userId as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Guard 0: Check if ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, primaryAssigneeId: true },
    });

    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Guard 1: Permission check
    if (!canManageCollaborators(user, ticket)) {
      res.status(403).json({ error: 'Only supervisors and the primary assignee can manage collaborators on this ticket' });
      return;
    }

    // Guard 2: Existence check
    const existingCollab = await prisma.ticketCollaborator.findUnique({
      where: { ticketId_userId: { ticketId, userId: targetUserId } },
    });
    if (!existingCollab) {
      res.status(404).json({ error: 'User is not a collaborator on this ticket' });
      return;
    }

    // Execute deletion and audit log in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.ticketCollaborator.delete({
        where: { ticketId_userId: { ticketId, userId: targetUserId } },
      });

      await tx.auditTimeline.create({
        data: {
          ticketId,
          actorId: user.userId,
          eventType: 'COLLABORATOR_REMOVED',
          collaboratorId: targetUserId,
        },
      });
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error removing collaborator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
