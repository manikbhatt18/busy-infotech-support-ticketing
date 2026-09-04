# Schema

Answer each of these, in your own words.

- **Table by table: what columns and types does each one have?**
  - **User**: `id` (UUID), `email` (String, unique), `passwordHash` (String), `name` (String), `role` (Enum: SUPERVISOR/AGENT), timestamps.
  - **Ticket**: `id` (UUID), `subject` (String), `description` (Text), `requesterEmail` (String), `priority` (Enum), `category` (String), `status` (Enum), `isArchived` (Boolean), `primaryAssigneeId` (FK to User), `slaTargetAt` (DateTime), `pendingEnteredAt` (DateTime), `resolvedAt` (DateTime), `closedAt` (DateTime), timestamps.
  - **TicketCollaborator**: `ticketId` (FK), `userId` (FK). Composite PK.
  - **Reply**: `id` (UUID), `body` (Text), `isInternal` (Boolean), `authorType` (Enum: AGENT/CUSTOMER), `ticketId` (FK), `authorId` (FK, nullable), `createdAt` (DateTime).
  - **AuditTimeline**: `id` (UUID), `ticketId` (FK), `actorId` (FK), `eventType` (Enum), `oldStatus` (Enum), `newStatus` (Enum), `oldAssigneeId` (String), `newAssigneeId` (String), `replyId` (FK), `createdAt` (DateTime).
  - **SlaAcknowledgment**: `id` (UUID), `ticketId` (FK), `agentId` (FK), `breachTime` (DateTime), `acknowledgedAt` (DateTime).

- **Which relationships are one-to-many, and which are many-to-many?**
  - **One-to-many**: `User` -> `Ticket` (primary assignee), `Ticket` -> `Reply`, `Ticket` -> `AuditTimeline`, `User` -> `AuditTimeline` (actor).
  - **Many-to-many**: `Ticket` <-> `User` (for collaborators). Modeled explicitly using the `TicketCollaborator` join table to easily query tickets for a specific user (both assigned and collaborated).

- **Which constraints are enforced by the database, and which by application code — and why did you draw the line there?**
  - **Database**: Foreign key integrity (preventing replies to deleted tickets), unique constraints (emails), and enums (restricting roles, statuses, and priorities to valid types). Additionally, `UPDATE` and `DELETE` on `AuditTimeline` will be disabled via PostgreSQL `REVOKE` (using `$queryRaw`). The DB handles these because they are immutable structural rules.
  - **Application**: Ticket lifecycle rules (New -> Open -> Pending -> Resolved -> Closed), fixed-window reopening, role permissions (Agents can't reassign away from themselves), and SLA clock pause/resume logic. The app handles these because they involve business logic, complex state machines, and time arithmetic which are much easier to express and test in code than in database triggers.

- **What did you deliberately denormalise?**
  - I denormalized SLA tracking onto the `Ticket` table (`slaTargetAt` and `pendingEnteredAt`). Instead of calculating the current SLA target dynamically on every page load by summing all status transition timestamps from `AuditTimeline` (which would be slow and complex), we update the `slaTargetAt` field in code whenever a ticket leaves the "Pending" status based on the time it spent in pending. This makes finding "breaching" tickets a simple `WHERE slaTargetAt < NOW()` query.
  - I also stored `resolvedAt` and `closedAt` on the `Ticket` table instead of inferring them from `updatedAt` or the timeline, ensuring that week-over-week aggregations and reopen window logic remain accurate even if tickets are edited after closure.

- **What would break first if this had 100x the data?**
  - Text search over ticket subject and description using SQL `LIKE` `%query%` would become a massive bottleneck and require a full-text search index (e.g., PostgreSQL `to_tsvector`).
  - The weekly dashboard aggregation (`GROUP BY` date bucket on the tickets/history) might become slow, requiring a materialized view.
