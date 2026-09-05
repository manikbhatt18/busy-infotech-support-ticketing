# Decisions

Log the decisions that actually shaped this codebase — the ones where a real alternative existed and
you picked one. At least five entries. For each: what you chose, what you rejected, and why. At least
one entry must be a decision you later reversed — say what changed your mind. It can be any entry
below, not necessarily the last one; add a **Later reversed:** line to whichever one it is.

## Decision 1: Database Technology (PostgreSQL vs MongoDB)

- **Chose:** PostgreSQL (via Supabase) with Prisma.
- **Rejected:** Document databases like MongoDB.
- **Why:** The project requires strict relational guarantees, especially for Goal 9's immutable audit history and Goal 4's ticket lifecycle constraints. The brief specifically mandated "locking down UPDATE/DELETE grants on the audit timeline table at the database level", which PostgreSQL supports natively via Row Level Security (RLS) or triggers. Additionally, Goal 8 requires time-bucketed aggregations which are generally much simpler in SQL than in Mongo aggregation pipelines.

## Decision 2: SLA State Tracking

- **Chose:** To denormalize SLA tracking onto the `Ticket` table by storing `slaTargetAt` (absolute deadline) and updating it on status changes.
- **Rejected:** Calculating the SLA target dynamically on the fly by summing paused times from `AuditTimeline` events every time we need to check alerts.
- **Why:** Computing SLAs from an event log at read-time across the entire active ticket queue is extremely expensive and complex to query (finding tickets that *will* breach soon). Storing `slaTargetAt` makes the query as simple as `WHERE slaTargetAt < NOW()`. The trade-off is slightly more complex write logic when transitioning statuses, but this is a read-heavy system where alert queues need to be lightning fast.

## Decision 3: Reply Author Modeling

- **Chose:** An explicit `ReplyAuthorType` enum (`AGENT` vs `CUSTOMER`) on the `Reply` model, with a nullable `authorId` that is only set for agents.
- **Rejected:** Attributing customer replies to a synthetic "System" user or making all customers full `User` accounts in the system.
- **Why:** The audit trail (Goal 9) must record exactly who acted, and a fake "System" user corrupts this history. Furthermore, Goal 4's clock-resume logic explicitly needs to query on whether a reply came from a customer. An explicit type ensures the system can differentiate without complex JOINs or brittle string matching on a system account.

## Decision 4: Agent Ticket Closing Permissions

- **Chose:** Agents are strictly prevented from transitioning a ticket to the `CLOSED` status, even if they are the primary assignee.
- **Rejected:** Allowing agents to close their own tickets.
- **Why:** Goal 1 explicitly states "Supervisors can reassign any ticket to any agent, close tickets, and see the entire queue." This specific callout for supervisors implies that closing tickets is an elevated privilege not granted to agents.

## Decision 5: Collaborator Reassignment Interpretation

- **Chose:** Agents (whether primary assignee or collaborator) cannot change the `primaryAssigneeId` to anyone else. They are locked out of reassignment entirely.
- **Rejected:** Allowing a collaborator to reassign the ticket to themselves, or allowing the primary assignee to reassign it to a collaborator.
- **Why:** Goal 1 states "Agents ... cannot reassign a ticket away from themselves." If a collaborator reassigned a ticket to themselves, they would be reassigning it *away* from the current primary assignee (another agent), which violates the rule. Therefore, agents cannot modify the assignee field at all.
