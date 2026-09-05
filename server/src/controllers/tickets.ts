import { Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const getTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let tickets;

    if (user.role === 'SUPERVISOR') {
      // Supervisors can see the entire queue
      tickets = await prisma.ticket.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          primaryAssignee: { select: { id: true, name: true, email: true } },
        }
      });
    } else {
      // Agents can only act on tickets where they are the primary assignee or a collaborator
      tickets = await prisma.ticket.findMany({
        where: {
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

const updateTicketSchema = z.object({
  primaryAssigneeId: z.string().nullable().optional(),
  status: z.enum(['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  // Other fields can be added here as needed for other goals
});

export const updateTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const ticketId = req.params.id as string;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { primaryAssigneeId, status } = updateTicketSchema.parse(req.body);

    // Find existing ticket to check permissions
    const existingTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        collaborators: true,
      }
    });

    if (!existingTicket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    if (user.role === 'AGENT') {
      // Agents can only update tickets where they are primary assignee or collaborator
      const isAssignee = existingTicket.primaryAssigneeId === user.userId;
      const isCollaborator = existingTicket.collaborators.some((c: any) => c.userId === user.userId);
      
      if (!isAssignee && !isCollaborator) {
        res.status(403).json({ error: 'You do not have permission to update this ticket' });
        return;
      }

      // Agents cannot reassign a ticket away from themselves
      if (primaryAssigneeId !== undefined && primaryAssigneeId !== user.userId) {
        res.status(403).json({ error: 'Agents cannot reassign a ticket away from themselves' });
        return;
      }
    }
    // Supervisors can reassign to anyone and close tickets, so no extra checks needed

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
