import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// --- GET /analytics ---
export const getAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Build the base filter: agents see only their tickets, supervisors see everything.
    const baseWhere = user.role === 'AGENT'
      ? {
          OR: [
            { primaryAssigneeId: user.userId },
            { collaborators: { some: { userId: user.userId } } }
          ]
        }
      : {};

    const now = new Date();

    // "Resolved this week" = trailing 7 days from now (Decision 23)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 8 weeks ago for chart data
    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel via $transaction for consistency
    const [
      openCount,
      pendingCount,
      breachingCount,
      resolvedThisWeekCount,
      statusBreakdown,
      agentBreakdownRaw,
      resolvedLast8Weeks,
    ] = await prisma.$transaction([
      // Headline 1: Open tickets
      prisma.ticket.count({
        where: { ...baseWhere, status: 'OPEN', isArchived: false },
      }),

      // Headline 2: Pending tickets
      prisma.ticket.count({
        where: { ...baseWhere, status: 'PENDING', isArchived: false },
      }),

      // Headline 3: Breaching SLA — exclude PENDING (clock paused), RESOLVED, CLOSED
      prisma.ticket.count({
        where: {
          ...baseWhere,
          isArchived: false,
          status: { notIn: ['RESOLVED', 'CLOSED', 'PENDING'] },
          slaTargetAt: { lt: now },
        },
      }),

      // Headline 4: Resolved in trailing 7 days
      prisma.ticket.count({
        where: {
          ...baseWhere,
          resolvedAt: { gte: sevenDaysAgo },
        },
      }),

      // Breakdown: by status
      prisma.ticket.groupBy({
        by: ['status'],
        where: { ...baseWhere, isArchived: false },
        orderBy: { status: 'asc' },
        _count: { id: true },
      }),

      // Breakdown: by agent (primaryAssigneeId)
      prisma.ticket.groupBy({
        by: ['primaryAssigneeId'],
        where: { ...baseWhere, isArchived: false },
        orderBy: { primaryAssigneeId: 'asc' },
        _count: { id: true },
      }),

      // Chart: all tickets resolved in last 8 weeks (for JS bucketing)
      prisma.ticket.findMany({
        where: {
          ...baseWhere,
          resolvedAt: { gte: eightWeeksAgo },
        },
        select: { resolvedAt: true },
      }),
    ]);

    // --- Map agent IDs to names ---
    const agentIds = agentBreakdownRaw
      .map((g) => g.primaryAssigneeId)
      .filter((id): id is string => id !== null);

    const agentUsers = agentIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        })
      : [];

    const agentNameMap = new Map(agentUsers.map((u) => [u.id, u.name]));

    const agentBreakdown = agentBreakdownRaw.map((g) => ({
      agentName: g.primaryAssigneeId
        ? (agentNameMap.get(g.primaryAssigneeId) || 'Unknown')
        : 'Unassigned',
      count: (typeof g._count === 'object' && g._count !== null ? g._count.id : 0) ?? 0,
    }));

    // --- Bucket resolved tickets into 8 trailing 7-day windows ---
    // Decision 22 (reversed): JS bucketing instead of $queryRaw.
    const weeklyResolved: { weekLabel: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

      const count = resolvedLast8Weeks.filter((t) => {
        if (!t.resolvedAt) return false;
        const resolved = new Date(t.resolvedAt).getTime();
        return resolved >= weekStart.getTime() && (i === 0 ? resolved <= weekEnd.getTime() : resolved < weekEnd.getTime());
      }).length;

      // Label: "MMM DD" of the week end (e.g. Today's date for current week)
      const label = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeklyResolved.push({ weekLabel: label, count });
    }

    res.json({
      headlines: {
        openTickets: openCount,
        pendingTickets: pendingCount,
        breachingTickets: breachingCount,
        resolvedThisWeek: resolvedThisWeekCount,
      },
      statusBreakdown: statusBreakdown.map((g) => ({
        status: g.status,
        count: (typeof g._count === 'object' && g._count !== null ? g._count.id : 0) ?? 0,
      })),
      agentBreakdown,
      weeklyResolved,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
