import { Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

import { Role, Ticket, TicketCollaborator } from '@prisma/client';

// --- Shared Permission Helper ---
type TicketWithCollaborators = Ticket & { collaborators: TicketCollaborator[] };
type JwtPayload = { userId: string; role: Role };

const canAgentActOnTicket = (user: JwtPayload, ticket: TicketWithCollaborators): boolean => {
  if (user.role === 'SUPERVISOR') return true;
  const isAssignee = ticket.primaryAssigneeId === user.userId;
  const isCollaborator = ticket.collaborators?.some((c) => c.userId === user.userId);
  return isAssignee || isCollaborator;
};

// --- GET /tickets ---
export const getTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Explicitly default to active-only if isArchived is omitted
    const isArchived = req.query.isArchived === 'true';

    let tickets;

    if (user.role === 'SUPERVISOR') {
      // Supervisors can see the entire queue
      tickets = await prisma.ticket.findMany({
        where: { isArchived },
        orderBy: { createdAt: 'desc' },
        include: {
          primaryAssignee: { select: { id: true, name: true, email: true } },
        }
      });
    } else {
      // Agents can only act on tickets where they are the primary assignee or a collaborator
      tickets = await prisma.ticket.findMany({
        where: {
          isArchived,
          OR: [
            { primaryAssigneeId: user.userId },
            { collaborators: { some: { userId: user.userId } } }
          ]
        },
        orderBy: { createdAt: 'desc' },
        include: {
          primaryAssignee: { select: { id: true, name: true, email: true } },
        }
      });
    }

    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- PATCH /tickets/:id/triage (Goal 1: Status & Assignee) ---
const updateTicketTriageSchema = z.object({
  primaryAssigneeId: z.string().nullable().optional(),
  status: z.enum(['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
});

export const updateTicketTriage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { primaryAssigneeId, status } = updateTicketTriageSchema.parse(req.body);

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
      // Assuming Goal 1: Agents cannot close tickets. (Check added here if missing earlier)
      if (status === 'CLOSED') {
        res.status(403).json({ error: 'Agents cannot close tickets' });
        return;
      }
    }

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        ...(primaryAssigneeId !== undefined && { primaryAssigneeId }),
        ...(status !== undefined && { status }),
      },
      include: {
        primaryAssignee: { select: { id: true, name: true, email: true } },
      }
    });

    res.json(updatedTicket);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: (error as any).errors });
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
});

export const createTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  // To be fully implemented after plan approval
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

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data,
    });

    res.json(updatedTicket);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
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
