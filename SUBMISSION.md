# Submission

Fill this in and commit it. This is the first file we open.

## Links

- **GitHub repository:** https://github.com/manikbhatt18/busy-infotech-support-ticketing
- **Live application:** (Local / Not Deployed)

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
| 1 | Role-based Security | Done | Agents see only assigned/collaborated tickets; Supervisors see all. |
| 2 | Searching & Filtering | Done | Implemented server-side with pagination and multiple dynamic filters. |
| 3 | Sorting & Pagination | Done | Dynamic sorting by SLA, creation date, priority. |
| 4 | Status Workflow | Done | Strict state machine on backend, UI only shows legal transitions. |
| 5 | Threading & Notes | Done | Differentiates public replies vs internal notes. |
| 6 | Bulk Actions | Done | Assign, Close, Archive in bulk via grid selection. |
| 7 | CSV Export | Done | Server-side stream generation of CSV based on current filters. |
| 8 | Analytics Dashboard | Done | Live metrics scoped by role, including 8-week resolution trends. |
| 9 | Archiving | Done | Automated archiving logic handling closed tickets over 30 days old. |
| 10 | SLA Alerts | Done | Navigation badge with polling, near-breach logic, and instance-specific acknowledgment. |

## How much time did you actually spend?

Around 25 hours. It was slightly difficult to understand all the domain-specific terms (like SLA targeting, breach windows, and role-based lifecycles) at first, as this was my first time building a support ticketing system from scratch. Once the schema and core concepts clicked, building out the REST API and React components went much smoother.

## What would you do next, with another 12 hours?

1. **WebSockets/Real-time Updates:** Move away from 30-second polling for SLA alerts and implement Server-Sent Events (SSE) or WebSockets for instant UI updates when tickets are created or SLAs breach.
2. **Robust Job Queue:** Move the background tasks (like SLA calculation updates and archiving) to a robust queueing system like BullMQ backed by Redis, rather than relying on in-memory Node tasks.
3. **Automated Testing:** Write a comprehensive integration test suite using Jest and Supertest for the API endpoints, and Playwright for core user flows on the frontend.

## What are you least happy with in this codebase, and why?

I am least happy with how the analytics dashboard fetches its data. Currently, it runs several large aggregation queries (`GROUP BY` and `COUNT` across multiple tables) on every page load. While I optimized it using `Promise.all` to reduce transaction overhead, at high scale this will bottleneck the database. Ideally, I would implement materialized views in PostgreSQL for the dashboard metrics, or use a background worker to periodically pre-calculate these stats and cache them in Redis.
