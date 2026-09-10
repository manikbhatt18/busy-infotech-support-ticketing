# Schema

The database is centered around users, tickets, collaborators, replies,
audit history, and SLA acknowledgements. PostgreSQL provides the
relational data integrity, while Prisma provides type-safe database
access from the TypeScript backend.

---

## Table by table: what columns and types does each one have?

### 1. User

Stores authenticated users and their roles.

- `id` — String (UUID), primary key
- `email` — String, unique
- `passwordHash` — String
- `name` — String
- `role` — Enum: `SUPERVISOR` / `AGENT`
- `createdAt` — DateTime
- `updatedAt` — DateTime

Relationships:

- One user can be the primary assignee of many tickets.
- One user can collaborate on many tickets.
- One user can author many replies.
- One user can be the actor in many audit events.
- One user can be the collaborator referenced by many audit events.
- One user can acknowledge many SLA alerts.

---

### 2. Ticket

The central entity of the support ticketing system.

- `id` — String (UUID), primary key
- `subject` — String
- `description` — String/Text
- `requesterEmail` — String
- `priority` — Enum: `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- `category` — String
- `status` — Enum: `NEW`, `OPEN`, `PENDING`, `RESOLVED`, `CLOSED`
- `isArchived` — Boolean
- `primaryAssigneeId` — String (UUID), nullable foreign key to `User`
- `slaTargetAt` — DateTime, nullable
- `pendingEnteredAt` — DateTime, nullable
- `resolvedAt` — DateTime, nullable
- `closedAt` — DateTime, nullable
- `createdAt` — DateTime
- `updatedAt` — DateTime

A ticket can have multiple collaborators, replies, audit events, and SLA
acknowledgements.

The `primaryAssigneeId` is nullable because a ticket can temporarily be
unassigned.

The SLA and lifecycle timestamps are stored directly on the ticket so
that the current state can be queried without reconstructing it from
the complete audit history.

---

### 3. TicketCollaborator

Join table that represents the many-to-many relationship between tickets
and users.

- `ticketId` — String (UUID), foreign key to `Ticket`
- `userId` — String (UUID), foreign key to `User`

The combination of `ticketId` and `userId` is the composite primary key:

`@@id([ticketId, userId])`

This prevents the same agent from being added to the same ticket more
than once.

Both relationships use `onDelete: Cascade`, so the collaboration record
is removed automatically when its ticket or user is deleted.

---

### 4. Reply

Stores replies and internal notes associated with tickets.

- `id` — String (UUID), primary key
- `body` — String/Text
- `isInternal` — Boolean
- `authorType` — Enum: `AGENT` / `CUSTOMER`
- `authorId` — String (UUID), nullable foreign key to `User`
- `ticketId` — String (UUID), foreign key to `Ticket`
- `createdAt` — DateTime

`authorId` is nullable because customer replies are represented using
`authorType = CUSTOMER` and do not require an authenticated `User`
record.

Agent replies have an `authorId` pointing to the authenticated agent.

The `ticketId` relationship uses `onDelete: Cascade`, while the
`authorId` relationship uses `onDelete: Restrict`.

There is also an index on `ticketId` because replies are frequently
queried when loading a ticket's conversation.

---

### 5. AuditTimeline

Stores the permanent history of important ticket actions.

- `id` — String (UUID), primary key
- `ticketId` — String (UUID), foreign key to `Ticket`
- `actorId` — String (UUID), foreign key to `User`
- `eventType` — Enum:
  - `TICKET_CREATED`
  - `STATUS_CHANGED`
  - `REASSIGNED`
  - `REPLY_ADDED`
  - `COLLABORATOR_ADDED`
  - `COLLABORATOR_REMOVED`
- `oldStatus` — Enum `TicketStatus`, nullable
- `newStatus` — Enum `TicketStatus`, nullable
- `oldAssigneeId` — String, nullable
- `newAssigneeId` — String, nullable
- `replyId` — String (UUID), nullable foreign key to `Reply`
- `collaboratorId` — String (UUID), nullable foreign key to `User`
- `createdAt` — DateTime

The status, assignee, reply and collaborator fields are nullable because
different event types require different pieces of contextual information.

For example:

- A `STATUS_CHANGED` event uses `oldStatus` and `newStatus`.
- A `REASSIGNED` event uses `oldAssigneeId` and `newAssigneeId`.
- A `REPLY_ADDED` event references `replyId`.
- A collaborator event references `collaboratorId`.

`oldAssigneeId` and `newAssigneeId` are stored as snapshot values rather
than foreign keys. This allows the audit record to preserve historical
assignee information independently of the current `User` relationships.

The table has an index on `ticketId` because the application frequently
loads the complete timeline for a specific ticket.

The audit table is append-only. PostgreSQL triggers prevent UPDATE and
DELETE operations on audit records, providing database-level protection
against modification or removal of historical events.

---

### 6. SlaAcknowledgment

Stores acknowledgement of a specific SLA alert instance by an agent.

- `id` — String (UUID), primary key
- `ticketId` — String (UUID), foreign key to `Ticket`
- `agentId` — String (UUID), foreign key to `User`
- `breachTime` — DateTime
- `acknowledgedAt` — DateTime

The combination of:

`ticketId + agentId + breachTime`

has a unique constraint.

This prevents an agent from acknowledging the same SLA instance more
than once.

`breachTime` identifies the specific SLA deadline that was acknowledged.
This is important because a ticket's SLA target can change after events
such as priority changes or reopening.

---

## Which relationships are one-to-many, and which are many-to-many?

### One-to-many relationships

- **User → Ticket:** One user can be the primary assignee of many
  tickets, while each ticket has zero or one primary assignee.

- **User → Reply:** One user can author many agent replies. Customer
  replies have no `authorId`.

- **Ticket → Reply:** One ticket can contain many replies, and each reply
  belongs to one ticket.

- **Ticket → AuditTimeline:** One ticket can have many audit events, and
  each audit event belongs to one ticket.

- **User → AuditTimeline (Actor):** One user can perform many auditable
  actions, and each audit event has one actor.

- **User → AuditTimeline (Collaborator):** One user can be referenced by
  many collaborator-related audit events.

- **Ticket → SlaAcknowledgment:** One ticket can have multiple SLA
  acknowledgements over time.

- **User → SlaAcknowledgment:** One agent can acknowledge SLA alerts for
  many tickets.

### Many-to-many relationship

**Ticket ↔ User through `TicketCollaborator`**

Tickets and users have a many-to-many relationship for collaboration.

- A ticket can have multiple agent collaborators.
- An agent can collaborate on multiple tickets.

This relationship is explicitly modeled using the `TicketCollaborator`
join table:

```text
User
  │
  │
  ▼
TicketCollaborator
  ▲
  │
  │
Ticket
```

Which constraints are enforced by the database, and which by application code — and why did you draw the line there?

I separate structural data-integrity rules from business rules.

Database-level constraints

The database handles rules that should remain true regardless of which application code or **API** accesses the database.

These include:

Primary keys for all tables Foreign key relationships Unique constraint on User.email Composite primary key on TicketCollaborator Unique constraint on SlaAcknowledgment(ticketId, agentId, breachTime) Enum values for roles, ticket statuses, priorities, reply types and audit event types Nullable and non-nullable field constraints Indexes on frequently queried relationships such as Reply.ticketId and AuditTimeline.ticketId Foreign-key delete behavior such as Cascade, Restrict and SetNull PostgreSQL trigger preventing **UPDATE** and **DELETE** operations on AuditTimeline

The audit trigger is particularly important. Application code can follow an append-only convention, but a database trigger prevents historical audit records from being modified or deleted even if another code path or database client attempts to do so.

Application-level constraints

The Express/TypeScript backend handles rules that depend on the current user, ticket state, or time.

These include:

Agents can only access tickets assigned to or collaborated on by them. Supervisors have full ticket access. Agents cannot close tickets. Agents cannot reassign tickets away from themselves. Only supervisors or the primary assignee can manage collaborators. Collaborators must have the **AGENT** role. Users cannot add themselves as collaborators. The primary assignee cannot also be added as a collaborator. Invalid ticket status transitions are rejected. Closed tickets can only be reopened within the configured reopen window. **SLA** time pauses while a ticket is **PENDING**. Customer replies can move a **PENDING** ticket back to **OPEN**. Priority changes recalculate the **SLA** target. A customer reply cannot be marked as an internal note.

These rules depend on business context rather than simple structural integrity, so keeping them in application code makes the state machine, permission logic and **SLA** calculations easier to understand, test and maintain.

What did you deliberately denormalise?

The main deliberate denormalisation is storing the ticket's current **SLA** and lifecycle state directly on the Ticket table rather than reconstructing it from the complete audit history.

**SLA** state

The following fields are stored directly on Ticket:

slaTargetAt pendingEnteredAt

When a ticket enters **PENDING**, pendingEnteredAt records when the **SLA** clock was paused.

When the ticket leaves **PENDING**, the application calculates the time spent in the pending state and extends slaTargetAt by that duration.

This allows **SLA** checks to use a simple date comparison:

slaTargetAt < current time

instead of scanning the audit history and reconstructing all previous status durations.

This is particularly useful for **SLA** alert queries and dashboard metrics.

Lifecycle timestamps

I also store:

resolvedAt closedAt

directly on Ticket.

This avoids having to infer the latest resolution or closure event from AuditTimeline.

It makes queries such as *tickets resolved during the last 7 days* and the closed-ticket reopen-window check much simpler and more efficient.

The trade-off is that the application must keep these fields consistent with the ticket status. Related ticket updates are therefore performed inside Prisma transactions where multiple records must change together.

What would break at **100**× scale?

The current schema and implementation are appropriate for the assignment and a moderate workload, but several areas would require optimization at significantly larger scale.

## Ticket text search

The current implementation searches ticket subjects and descriptions using Prisma's contains filtering.

At a much larger ticket volume, arbitrary substring searches could become expensive because they may require scanning many rows.

I would introduce PostgreSQL full-text search using tsvector with appropriate **GIN** indexes.

If the search requirements became more advanced, a dedicated search system such as OpenSearch could be considered.

## Analytics aggregation

The analytics dashboard currently performs several **COUNT** and **GROUP** BY queries.

The independent queries are executed concurrently using Promise.all, which reduces overall request latency.

However, the database still has to perform the aggregation work every time the dashboard is requested.

At larger scale, I would move these calculations toward:

PostgreSQL materialized views Pre-computed analytics tables Background aggregation jobs Redis caching for frequently requested metrics

This would reduce repeated expensive aggregation work.

## AuditTimeline growth

The audit trail is intentionally permanent and append-only.

At **100**× the current volume, the AuditTimeline table could become very large.

Potential improvements include:

Adding indexes based on actual query patterns Time-based partitioning if the table becomes sufficiently large Archiving very old records where business requirements allow it Monitoring query plans and index usage

Any archival strategy would need to preserve the audit requirements of the system.

## SLA alert polling

The current **SLA** alert system uses frontend polling.

At a much larger number of users and active tickets, frequent polling could generate unnecessary database requests.

A future implementation could use:

Background workers BullMQ with Redis Scheduled **SLA** evaluation jobs Server-Sent Events (**SSE**) WebSockets

This would allow **SLA** alerts to be generated and delivered more efficiently without every client repeatedly querying the **API**.

## Database connections and API scaling

At high concurrency, database connections and **API** instances would need to be managed carefully.

The Express backend could be horizontally scaled, while PostgreSQL connection pooling would become increasingly important.

I would monitor:

Connection pool usage Query latency Slow queries Database **CPU** and memory Index usage **API** response times

The goal would be to scale the **API** independently while protecting the database from excessive concurrent connections and expensive queries.


