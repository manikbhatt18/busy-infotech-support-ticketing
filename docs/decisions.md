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

## Decision 6: Initial Ticket Assignment (Goal 2)

- **Chose:** When an Agent or Supervisor creates a ticket, they are automatically set as the `primaryAssigneeId`.
- **Rejected:** Leaving the ticket unassigned (`primaryAssigneeId: null`) upon creation.
- **Why:** Goal 1 strictly restricts Agents to only act on tickets where they are the primary assignee or a collaborator. If an Agent created a ticket and it was left unassigned, they would immediately lose all read/write access to the very ticket they just created, which is a poor user experience. Automatically assigning the creator ensures they maintain access and can continue editing or triaging the ticket.

## Decision 7: Requester Modeling

- **Chose:** Store the `requesterEmail` as a simple string on the `Ticket` model.
- **Rejected:** Creating a separate `Customer` or `Requester` user model with authentication and linking it via a foreign key.
- **Why:** Customers never authenticate into this system. Modeling them as a `User` would bloat the `User` table with non-authenticated records and complicate the authentication logic. A plain string is sufficient for tracking the requester and interacting with them via hypothetical email channels.

## Decision 8: AuditTimeline Exclusions

- **Chose:** To *not* write to the `AuditTimeline` when users edit ticket details (subject, description, priority, category) or when they archive/restore tickets.
- **Rejected:** Creating a generic `TICKET_EDITED` or `TICKET_ARCHIVED` event for the timeline.
- **Why:** Goal 9 strictly defines the required audit history: "when it changed status, when it was reassigned, and any replies." There is no requirement to log plain field edits or queue visibility changes. Expanding the timeline to include these would pollute the strictly required event types.

## Decision 9: AuthorType Verification (Goal 3)

- **Chose:** To trust the submitting agent's self-reported authorType.
- **Rejected:** Independently verifying the author or refusing simulated customer replies.
- **Why:** authorType is a self-reported flag set by the submitting agent, not independently verified — there is no proof a customer actually said what's logged as their reply. This is an accepted limitation given the assignment's scope excludes email/customer-portal integration; a production system would instead derive authorType: CUSTOMER automatically from an inbound email webhook, removing agent self-reporting from the trust boundary entirely.

## Decision 10: AuditTimeline Actor vs Reply Author

- **Chose:** AuditTimeline.actor always records the logged-in user submitting the API request, even for simulated customer replies.
- **Rejected:** Setting AuditTimeline.actorId to null or a customer ID for simulated customer replies.
- **Why:** AuditTimeline.actor = who performed the logging action in the app, while Reply.authorType = who the message is attributed to — these are deliberately different fields answering different questions, not redundant. Since customers never authenticate, they cannot be the actor performing the logging action in this system.
