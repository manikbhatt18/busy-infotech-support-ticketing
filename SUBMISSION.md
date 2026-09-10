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
| Database | PostgreSQL, Prisma ORM | PostgreSQL is robust for relational data. Prisma offers fantastic developer experience, type safety, and handles complex schema migrations cleanly. |
| Hosting | Supabase | Supabase provides a generous free tier for PostgreSQL with built-in connection pooling, which is great for serverless or decoupled stacks. |

## Goal checklist

Mark each honestly. Partial is fine — say what is partial.

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Accounts and roles | Done | Server-enforced: agents see only assigned/collaborating tickets, cannot close tickets or reassign away from themselves; supervisors have full access. |
| 2 | Tickets | Done | Create/edit with subject, description, requester, priority, category; archive/restore removes from default views without deleting history. |
| 3 | Replies inside tickets | Done | Internal notes vs. customer-visible replies, chronological, with strict role checks on posting. |
| 4 | Status lifecycle & SLA | Done | Explicit legal-transition table enforced server-side; SLA clock pauses in Pending, resumes on customer reply; closed tickets reopenable within a fixed window. |
| 5 | Collaborators | Done | Any number of agent collaborators per ticket; only the primary assignee or a supervisor can add/remove them. |
| 6 | Finding tickets | Done | Server-side search, filters, sorting, and pagination with total match count. |
| 7 | Bulk actions & CSV export | Done | Bulk reassign/close report per-ticket success/failure, not all-or-nothing; CSV export covers the full filtered set. |
| 8 | Analytics dashboard | Done | Headline numbers, status/agent breakdowns, 8-week resolution chart, scoped by role. |
| 9 | Immutable audit trail | Done | Every status change, reassignment, and reply logged permanently; enforced at the database level via a Postgres trigger blocking UPDATE/DELETE, not just app-level logic. |
| 10 | SLA breach alerts | Done | Polling-based alert badge, near-breach and breach detection, per-instance acknowledgment. |

## How much time did you actually spend?

Around 20 hours. It was slightly difficult to understand all the domain-specific terms (like SLA targeting, breach windows, and role-based lifecycles) at first, as this was my first time building a support ticketing system from scratch. Once the schema and core concepts clicked, building out the REST API and React components went much smoother.

## What would you do next, with another 12 hours?

1. **WebSockets/Real-time Updates:** Move away from 30-second polling for SLA alerts and implement Server-Sent Events (SSE) or WebSockets for instant UI updates when tickets are created or SLAs breach.
2. **Robust Job Queue:** Move the background tasks (like SLA calculation updates and archiving) to a robust queueing system like BullMQ backed by Redis, rather than relying on in-memory Node tasks.
3. **Automated Testing:** Write a comprehensive integration test suite using Jest and Supertest for the API endpoints, and Playwright for core user flows on the frontend.

## What are you least happy with in this codebase, and why?

I am least happy with how the analytics dashboard fetches its data. Currently, it runs several large aggregation queries (`GROUP BY` and `COUNT` across multiple tables) on every page load. While I optimized it using `Promise.all` to reduce transaction overhead, at high scale this will bottleneck the database. Ideally, I would implement materialized views in PostgreSQL for the dashboard metrics, or use a background worker to periodically pre-calculate these stats and cache them in Redis.
