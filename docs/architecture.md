# Architecture

## What are the moving pieces, and how do they talk to each other?

The system is broken down into three main pieces:
1. **The Frontend (Client):** A Next.js (React) application styled with Tailwind CSS. It communicates with the backend exclusively via REST API calls over HTTP (using standard `fetch` wrappers that attach JWT bearer tokens).
2. **The Backend (API Server):** A Node.js Express server written in TypeScript. It handles route definitions, role-based authentication/authorization, and contains all the core business logic (like SLA calculations and legal status transitions). It talks to the database using Prisma ORM.
3. **The Database:** A relational PostgreSQL database that stores the exact truth of the ticketing system (Users, Tickets, Replies, Audits, and Acknowledgments).

## Where does each piece run?

- **Frontend:** The React app runs directly in the user's browser, pulling static assets from the Next.js server (which would run on a platform like Vercel).
- **Backend:** The Express server runs as a standalone Node.js process (which would run on a platform like Heroku, Render, or AWS ECS).
- **Database:** Hosted remotely on Supabase's cloud infrastructure, utilizing their built-in connection pooling (PgBouncer).

## What is the request path for one representative user action, end to end?

**User Action:** An Agent acknowledges a near-breach SLA Alert.
1. **Browser:** The user clicks "Acknowledge" on the SLA Alerts panel. The React component triggers an async `POST /api/sla-alerts/:ticketId/acknowledge` call via `apiFetch`.
2. **Express Server:** The request hits the backend. The `authenticateToken` middleware intercepts it, verifies the JWT in the `Authorization` header, and attaches the `user` object to the request.
3. **Controller:** The `acknowledgeSlaAlert` controller checks if the ticket exists. It verifies that the current `slaTargetAt` is valid and creates a new `SlaAcknowledgment` record tied specifically to that exact breach instance time.
4. **Prisma -> PostgreSQL:** Prisma translates the `create` call into a parameterized SQL `INSERT` statement and executes it against the Supabase PostgreSQL database.
5. **Response:** Postgres returns success to Prisma, the controller sends back a `201 Created` HTTP response.
6. **Browser:** The React component receives the 201 response, instantly filters the acknowledged ticket out of the local state array, and fires an `onAlertAcknowledged` callback to decrement the red notification badge on the parent tab—all without reloading the page.

## What did you decide *not* to build, and why?

I explicitly decided **not** to build a dedicated background worker queue (e.g., using Redis and BullMQ or RabbitMQ) for SLA breach notifications or archiving. 

While an event-driven system pushing WebSocket notifications to clients when an SLA breaches is the "purest" architecture, it introduces massive deployment complexity (requiring cache servers, worker processes, and socket gateways). Instead, I chose a **"lazy evaluation" polling architecture**. The frontend simply polls a lightweight `GET /sla-alerts/count` endpoint every 30 seconds, and the backend calculates SLA breaches purely on-the-fly using `slaTargetAt < NOW`. This is significantly easier to deploy, scale, and maintain for a startup or MVP ticketing system, while still providing the required feature constraints.
