# Submission

Fill this in and commit it. This is the first file we open.

## Links

- **GitHub repository:** https://github.com/manikbhatt18/busy-infotech-support-ticketing
- **Live application:** https://busy-infotech-support-ticketing.vercel.app/

## Notes for the reviewer

The database is hosted on the Supabase free tier. If the project has been inactive, it might take a few moments for the database to wake up from its paused state on the first request. The backend might throw a `P1001` or `P2028` error initially until the connection pool warms up.

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Agent | agent1@test.com | agent1 |
| Supervisor | bhattmanik94@gmail.com | manikbhatt |

## Stack

| Layer | What you used | Why |
|-------|---------------|-----|
| Frontend | Next.js (React), Tailwind CSS | Next.js provides excellent routing and performance out of the box. Tailwind allows for rapid, consistent styling without context switching. |
| Backend | Node.js, Express, TypeScript | Express is lightweight and unopinionated, perfect for a REST API. TypeScript ensures type safety across the domain logic. |
| Database | PostgreSQL, Prisma ORM | PostgreSQL is robust for relational data. Prisma provides type-safe database access and handles schema migrations cleanly. |
| Frontend Hosting | Vercel | Vercel provides straightforward deployment and hosting for the Next.js frontend with automatic builds from GitHub. |
| Backend Hosting | Render | Render hosts the Express/Node.js API separately from the frontend and provides a simple deployment workflow. |
| Database Hosting | Supabase | Supabase provides managed PostgreSQL hosting and connection pooling, which works well for a decoupled application. |


## Key technical decisions

- **Server-side authorization:** Permissions are enforced in Express
  middleware/controllers rather than relying on frontend visibility.

- **Prisma transactions:** Related changes such as reassignment +
  audit logging and reply + status updates are performed atomically.

- **Explicit status state machine:** Ticket status transitions are
  defined in a server-side transition table so invalid lifecycle changes
  cannot be performed through direct API calls.

- **Soft archiving:** Tickets are archived using `isArchived` instead
  of being deleted, preserving their history and allowing restoration.

- **Polling for SLA alerts:** SLA alerts are evaluated on demand and
  the frontend polls periodically instead of introducing WebSockets or
  a background worker for this assignment.

- **Database-level audit protection:** Audit records are protected
  against UPDATE/DELETE at the PostgreSQL level, providing stronger
  immutability than application-level checks alone.

## Goal checklist

Mark each honestly. Partial is fine — say what is partial.

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Accounts and roles | Done | Server-enforced RBAC. Agents see assigned/collaborating tickets and cannot close or reassign away from themselves. Supervisors have full access. |
| 2 | Tickets | Done | Create/edit tickets with requester, priority, category, subject and description. Archive/restore preserves history. |
| 3 | Replies inside tickets | Done | Supports internal notes and customer-visible replies with chronological ordering, access checks and validation. |
| 4 | Status lifecycle & SLA | Done | Server-side transition rules. SLA pauses in Pending, resumes on customer reply, and closed tickets can be reopened within the allowed window. |
| 5 | Collaborators | Done | Multiple agent collaborators per ticket. Only the primary assignee or supervisor can add/remove collaborators. |
| 6 | Finding tickets | Done | Server-side search, filtering, sorting, pagination and total result count. |
| 7 | Bulk actions & CSV export | Done | Bulk close/reassign returns per-ticket success/failure. CSV exports the complete filtered result set. |
| 8 | Analytics dashboard | Done | Role-scoped headline metrics, status/agent breakdowns and an 8-week resolution chart. |
| 9 | Immutable audit trail | Done | Status changes, reassignments and replies are permanently logged. PostgreSQL trigger blocks audit UPDATE/DELETE. |
| 10 | SLA breach alerts | Done | Polling-based alerts for near-breach/breached tickets with per-SLA-instance acknowledgment. |


## Suggested demo flow

For the quickest review of the main features:

1. Login as Supervisor.
2. Open the ticket queue and inspect the seeded tickets.
3. Create a ticket and observe the automatically calculated SLA target.
4. Assign an agent and add a collaborator.
5. Open the ticket and add an internal note.
6. Change the ticket through the valid status lifecycle.
7. Put the ticket into Pending and observe the SLA pause behavior.
8. Add a customer reply and observe Pending → Open and SLA resumption.
9. Open the audit timeline and verify the recorded actions.
10. Login as an Agent and verify restricted ticket visibility/permissions.
11. Try bulk reassignment/closing.
12. Check the SLA alert badge and acknowledge an alert.
13. Open Analytics and export the filtered queue as CSV.

## How much time did you actually spend?

Around 20 hours. It was slightly difficult to understand all the domain-specific terms (like SLA targeting, breach windows, and role-based lifecycles) at first, as this was my first time building a support ticketing system from scratch. Once the schema and core concepts clicked, building out the REST API and React components went much smoother.

## What would you do next, with another 12 hours?

1. **WebSockets/Real-time Updates:** Move away from 30-second polling for SLA alerts and implement Server-Sent Events (SSE) or WebSockets for instant UI updates when tickets are created or SLAs breach.
2. Robust Background Processing:
   Introduce BullMQ + Redis for background work such as notifications,
   scheduled maintenance, and other tasks that should not run inside
   request/response cycles. The current implementation intentionally
   uses polling and on-demand SLA evaluation to keep the MVP simple.
3. **Automated Testing:** Write a comprehensive integration test suite using Jest and Supertest for the API endpoints, and Playwright for core user flows on the frontend.

## What are you least happy with in this codebase, and why?

I am least happy with the analytics dashboard's data-fetching strategy.

Currently, the dashboard performs several COUNT and GROUP BY queries
on every page load. I use Promise.all so the independent queries can
execute concurrently, which reduces the overall response time, but
the database still has to perform these aggregations repeatedly.

At larger scale, I would move these metrics toward pre-computed
analytics using PostgreSQL materialized views or a background worker,
with Redis caching for frequently requested dashboard data.

For the current assignment, I intentionally kept the implementation
simple and avoided premature infrastructure complexity.
