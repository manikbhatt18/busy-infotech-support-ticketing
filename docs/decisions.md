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


## Decision 3: Initial Ticket Assignment (Goal 2)

- **Chose:** When an Agent or Supervisor creates a ticket, they are automatically set as the `primaryAssigneeId`.
- **Rejected:** Leaving the ticket unassigned (`primaryAssigneeId: null`) upon creation.
- **Why:** Goal 1 strictly restricts Agents to only act on tickets where they are the primary assignee or a collaborator. If an Agent created a ticket and it was left unassigned, they would immediately lose all read/write access to the very ticket they just created, which is a poor user experience. Automatically assigning the creator ensures they maintain access and can continue editing or triaging the ticket.

## Decision 4: Requester Modeling

- **Chose:** Store the `requesterEmail` as a simple string on the `Ticket` model.
- **Rejected:** Creating a separate `Customer` or `Requester` user model with authentication and linking it via a foreign key.
- **Why:** Customers never authenticate into this system. Modeling them as a `User` would bloat the `User` table with non-authenticated records and complicate the authentication logic. A plain string is sufficient for tracking the requester and interacting with them via hypothetical email channels.


## Decision 5: Full Status Transition Table (Goal 4)

- **Chose:** An explicit allow-list state machine. Every `PATCH /tickets/:id/status` request checks `ALLOWED_TRANSITIONS[currentStatus].includes(newStatus)` before any other logic runs.
- **Rejected:** Ad-hoc special-case checks only for edge cases (e.g., only checking agents-can't-close and reopen-window). Without an explicit table, illegal jumps like `NEW → CLOSED` or `RESOLVED → PENDING` would silently succeed, which directly violates the spec's "Any other move must be rejected by the server with a message explaining why."

```
NEW      → [OPEN]
OPEN     → [PENDING, RESOLVED]
PENDING  → [OPEN]
RESOLVED → [CLOSED, OPEN]
CLOSED   → [OPEN]   (only within 7-day window, enforced separately)
```

## Decision 6: SLA Recalculation Formula on Priority Change (Goal 4)

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



## Decision 7: canManageCollaborators vs canAgentActOnTicket (Goal 5)

- **Chose:** A dedicated `canManageCollaborators` helper that only permits SUPERVISOR or the primary assignee to add/remove collaborators.
- **Rejected:** Reusing the existing `canAgentActOnTicket` helper for `addCollaborator` and `removeCollaborator`.
- **Why:** `canAgentActOnTicket` deliberately allows collaborators to act on a ticket. If reused for collaborator management, it would allow a collaborator to add/remove *other* collaborators, which is a privilege escalation path. Only the ticket owner (primary assignee) or a supervisor should dictate who else gets access.

## Decision 8: Only AGENTs as Collaborators (Goal 5)

- **Chose:** To enforce that only users with `role === 'AGENT'` can be added as collaborators.
- **Rejected:** Allowing a SUPERVISOR to be added as a collaborator.
- **Why:** Supervisors inherently have full read/write access to every ticket in the system. Adding them to the `TicketCollaborator` join table creates meaningless redundancy in the database and implies a limitation on their access that doesn't actually exist.


## Decision 9: Query Construction and Security (Goal 6)

- **Chose:** Used Prisma's `AND` operator to strictly isolate the role-based security filter from user-provided search filters.
- **Rejected:** Combining user search terms and the agent security restriction using multiple top-level `OR` clauses in a single object spread.
- **Why (Reversed/Corrected):** My initial draft used a single spread object for the `where` clause. When an agent used the search filter (which uses an `OR` condition across subject and description), it completely overwrote the security `OR` condition that restricts agents to their own tickets. This would have caused a massive privilege escalation bug where any agent could search the entire system's tickets. Wrapping both `OR` conditions in an `AND` array forces Prisma to apply them compositively.



## Decision 10: Partial Bulk Action Failure Handling (Goal 7)

- **Chose:** Return `200 OK` with an array of per-ticket execution results `{ ticketId, success, reason }` instead of failing the entire HTTP transaction when one ticket fails.
- **Why:** In bulk operations, some tickets may succeed (e.g. valid transition, user has permission) while others fail (e.g. ticket already CLOSED, permission denied). Rolling back the entire bulk operation or aborting halfway creates poor UX and prevents partial progress. Returning per-ticket status allows the UI to display a detailed modal summarizing exact successes and failure reasons for each ticket.




## Decision 11: Weekly Resolution Chart Data Source (Goal 8) — Later reversed

- **Chose (originally):** Use `$queryRaw` with `date_trunc('week', "resolvedAt")` for the 8-week aggregation, since Prisma's `groupBy` doesn't support date-truncation expressions.
- **Reversed to:** Fetch resolved tickets via a standard Prisma query (`resolvedAt >= 8 weeks ago`), bucket into 8 trailing 7-day windows in JavaScript.
- **Why reversed:** Simpler code, avoids raw SQL for a single feature, and at this dataset's scale the performance difference is negligible. Uses trailing 7-day windows counted back from `now`, not calendar weeks, to avoid timezone and partial-week edge cases.
- **What breaks at 100× data:** This approach loads every ticket resolved in the last 8 weeks into memory to bucket manually — at high volume, that's real memory/transfer overhead a database-side `GROUP BY` wouldn't have. The original `$queryRaw` approach would be the correct fix at production scale.


## Decision 12: Acknowledgment Tied to Breach Instance (Goal 10)

- **Chose:** The `SlaAcknowledgment.breachTime` field stores the ticket's current `slaTargetAt` at the moment of acknowledgment, tying the ack to a specific breach instance.
- **Rejected:** Acknowledging just by `(ticketId, agentId)` — which would permanently suppress the alert even after a reopen.
- **Why:** The spec explicitly says "If the ticket is later reopened and breaches its target response time again, the alert returns." On reopen, `updateTicketStatus` computes a fresh `slaTargetAt`. The old `SlaAcknowledgment` with the old `breachTime` no longer matches the new `slaTargetAt`, so the alert re-surfaces with zero extra logic. The `@@unique([ticketId, agentId, breachTime])` constraint in the schema was designed for exactly this pattern.


