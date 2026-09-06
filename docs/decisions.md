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

## Decision 11: Full Status Transition Table (Goal 4)

- **Chose:** An explicit allow-list state machine. Every `PATCH /tickets/:id/status` request checks `ALLOWED_TRANSITIONS[currentStatus].includes(newStatus)` before any other logic runs.
- **Rejected:** Ad-hoc special-case checks only for edge cases (e.g., only checking agents-can't-close and reopen-window). Without an explicit table, illegal jumps like `NEW → CLOSED` or `RESOLVED → PENDING` would silently succeed, which directly violates the spec's "Any other move must be rejected by the server with a message explaining why."

```
NEW      → [OPEN]
OPEN     → [PENDING, RESOLVED]
PENDING  → [OPEN]
RESOLVED → [CLOSED, OPEN]
CLOSED   → [OPEN]   (only within 7-day window, enforced separately)
```

**Rationale per row:**
- `NEW → OPEN`: Normal pickup — agent begins work. Only legal move from NEW.
- `NEW → anything else`: Brand-new tickets must be acknowledged (opened) first. Jumping to RESOLVED or CLOSED without ever working the ticket is meaningless.
- `OPEN → PENDING`: Agent has replied and is waiting on the customer.
- `OPEN → RESOLVED`: Agent resolves without the ticket ever going pending.
- `OPEN → CLOSED`: Rejected — must resolve first. Closing is a deliberate supervisor finalisation of an already-resolved ticket.
- `PENDING → OPEN`: Customer replied (automatic) or agent manually resumes. Only legal move from PENDING.
- `PENDING → RESOLVED`: Rejected — cannot resolve while waiting on a customer. Agent must re-engage (→ OPEN) first.
- `PENDING → CLOSED`: Rejected — same reason, plus SLA clock semantics become undefined if we close while paused.
- `RESOLVED → CLOSED`: Supervisor confirms the ticket is permanently done.
- `RESOLVED → OPEN`: Allowed — reopening before the supervisor has formally closed it (e.g., customer calls back). This avoids requiring a two-step `RESOLVED → CLOSED → OPEN` for a simple reopen.
- `CLOSED → OPEN`: Allowed within the 7-day window (see Decision 13). Only move from CLOSED.

**Same-status requests** (e.g., `PENDING → PENDING`) are rejected with HTTP 422 and a specific message — treated as an error rather than a silent no-op, so callers cannot silently send stale state.

**Permission check order in `updateTicketStatus`:**
1. `canAgentActOnTicket` — checked first, before the transition table. An agent with no relationship to the ticket cannot attempt any status change regardless of whether the transition would otherwise be legal.
2. Transition table.
3. Role check (agents cannot set CLOSED).
4. 7-day reopen window (for CLOSED → OPEN only).

## Decision 12: SLA Recalculation Formula on Priority Change (Goal 4)

- **Chose:** Full reset: `slaTargetAt = NOW + SLA_HOURS[newPriority]`.
- **Rejected:** Proportional carry-over (preserve the fraction of time already consumed, rescale to new window).
- **Why:** Proportional carry-over can produce a deadline in the past. Example: ticket has been OPEN for 20h as MEDIUM (24h window), priority is upgraded to URGENT (1h window). Proportional result = 20/24 × 1h already consumed → deadline = NOW − 0.83h, immediately breached. The opposite of the intended effect of upgrading urgency. Full reset gives the ticket its full new window, which is predictable and matches the intent.

**Sub-case — Priority change while ticket is PENDING:**
When priority changes AND `ticket.status === 'PENDING'`, BOTH fields must reset together:
- `slaTargetAt = NOW + SLA_HOURS[newPriority]`
- `pendingEnteredAt = NOW`

**Why both must reset — numeric example:**
- T=0: ticket enters PENDING with MEDIUM SLA. `slaTargetAt = T+24h`, `pendingEnteredAt = T+0`.
- T=10h: priority changes to URGENT (1h window). If only `slaTargetAt` resets to `T+11h` but `pendingEnteredAt` stays `T+0`:
  - Ticket leaves PENDING at T=12h. Resume math: `newSlaTargetAt = T+11h + (T+12h − T+0) = T+11h + 12h = T+23h`.
  - The full 12h pause is counted, but only 2h of it (T+10h → T+12h) happened under the new URGENT priority. The 10h before the priority change is double-counted, giving the ticket 11h instead of its intended 1h URGENT window.
- **Correct fix:** also reset `pendingEnteredAt = NOW` so the pause timer restarts cleanly from the moment of the priority change. Resume at T=12h then gives: `newSlaTargetAt = T+11h + (T+12h − T+10h) = T+11h + 2h = T+13h` — exactly 1h after T=12h, the correct URGENT window.

## Decision 13: Who Can Reopen a Closed Ticket (Goal 4)

- **Chose:** Any agent who can act on the ticket (primary assignee or collaborator), or any supervisor, may reopen a CLOSED ticket within the 7-day window.
- **Rejected:** Supervisors only (matching who can close).
- **Why:** Once a ticket is reopened it lands back with the assigned agent. Locking only supervisors into reopening would mean agents can't self-serve re-engagement on tickets they own — unnecessary workflow friction for a common case (customer calls back after closure). Reopening always moves the ticket to `OPEN` (not to whatever status it was before closing). `resolvedAt` and `closedAt` are cleared on reopen. A fresh SLA window is assigned based on current priority.

## Decision 14: SLA Target Hours and Reopening Window Values (Goal 4)

- **Chose:** URGENT=1h, HIGH=4h, MEDIUM=24h, LOW=48h. Reopening window=7 days.
- **Why these numbers:** The spec leaves both values explicitly to the implementer. The SLA tiers match common support-industry tiered response standards (critical/same-hour, high/same-half-day, normal/next-business-day, low/two-day). 7 days gives supervisors and agents a full work-week to catch accidental closures, which is the standard "hold period" in most helpdesk systems.

