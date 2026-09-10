# Architecture

## What are the moving pieces, and how do they talk to each other?

The system is broken down into three main pieces:

1. **Frontend (Client):** A Next.js (React) application styled with Tailwind CSS. It communicates with the backend exclusively through REST API calls over HTTP. A shared `fetch` wrapper attaches the JWT bearer token to authenticated requests.

2. **Backend (API Server):** A Node.js Express server written in TypeScript. It handles authentication, role-based authorization, request validation, and all core business rules such as ticket permissions, status transitions, SLA calculations, replies, collaborators, bulk actions, and audit logging. It communicates with PostgreSQL through Prisma ORM.

3. **Database:** A PostgreSQL database hosted on Supabase. It is the system's source of truth and stores users, tickets, replies, collaborators, audit events, SLA targets, and SLA acknowledgments.

The main design principle is that the **frontend handles presentation and user interaction, while the backend enforces authorization and business rules**.

---

## Where does each piece run?

- **Frontend:** The Next.js application is deployed on **Vercel** and runs in the user's browser.
- **Backend:** The Express API server runs as a standalone Node.js process on **Render**.
- **Database:** PostgreSQL is hosted on **Supabase**, using its connection pooling infrastructure (PgBouncer) for database connections.

The production request flow is therefore:

**Browser → Vercel Frontend → Render API → Prisma → Supabase PostgreSQL**

---

## What is the request path for one representative user action, end to end?

**User Action:** An Agent acknowledges a near-breach SLA alert.

1. **Browser:** The agent clicks **Acknowledge** in the SLA Alerts panel. The React component sends an async `POST /api/sla-alerts/:ticketId/acknowledge` request through the shared `apiFetch` wrapper.

2. **Authentication Middleware:** The request reaches the Express backend. The `authenticateToken` middleware reads the JWT from the `Authorization` header, verifies it, and attaches the authenticated user's ID and role to the request.

3. **Controller:** The `acknowledgeSlaAlert` controller verifies that the ticket exists and that the current SLA target is valid. The acknowledgment is stored against the specific SLA breach time so that a later SLA cycle can be acknowledged separately.

4. **Prisma → PostgreSQL:** Prisma creates a parameterized SQL `INSERT` operation and executes it against the Supabase PostgreSQL database.

5. **Response:** PostgreSQL returns the result to Prisma. The controller sends a successful HTTP response to the frontend.

6. **Browser:** The React component receives the response, removes the acknowledged alert from local state, and updates the notification count without requiring a full page reload.

---

## How is SLA monitoring implemented?

The application uses a **lazy evaluation + polling** approach rather than a dedicated background worker.

Each ticket stores an `slaTargetAt` timestamp representing its current SLA deadline. The backend determines whether an SLA is approaching or has breached by comparing this timestamp with the current server time.

The frontend periodically polls the SLA alert endpoints (currently every 30 seconds) to retrieve the latest alert state.

This means the database does not need a continuously running process to update every ticket when its deadline passes. The deadline is evaluated when the SLA endpoint is requested.

Pending time is also accounted for by storing `pendingEnteredAt`. When a ticket leaves the `PENDING` state, the paused duration is added to the SLA target.

---

## What did you decide not to build, and why?

I explicitly decided **not to build a dedicated background worker/queue system** such as Redis + BullMQ or RabbitMQ for SLA notifications.

A more event-driven architecture could use background workers to continuously monitor SLA deadlines and WebSockets or Server-Sent Events (SSE) to push notifications to connected clients. However, that would introduce additional infrastructure such as:

- Redis or another queue/broker
- Worker processes
- Additional deployment and monitoring requirements
- WebSocket/SSE connection management

For this assignment, the polling approach provides the required SLA alert functionality with significantly less operational complexity.

The tradeoff is that alerts are not pushed to the browser instantly. They are detected when the next polling request occurs, with the current frontend polling interval being approximately 30 seconds.

This is a deliberate **simplicity vs. real-time responsiveness** tradeoff suitable for the current MVP.

---

## Key architectural decisions

### Backend-enforced authorization

Role and ticket-access checks are performed on the server rather than relying only on frontend UI restrictions.

This prevents a user from bypassing permissions by manually calling the API.

### PostgreSQL as the source of truth

Ticket state, replies, collaborators, SLA information, and audit history are persisted in PostgreSQL. The frontend only maintains temporary UI state.

### Prisma for database access

Prisma provides typed database access and makes transactional operations easier to implement for operations such as ticket updates combined with audit events.

### Transactions for critical operations

Operations that modify multiple related records are performed inside database transactions where consistency matters.

For example, changing a ticket's status can update the ticket and create the corresponding audit event as one atomic operation.

### Immutable audit history

Audit records are treated as append-only history. A PostgreSQL trigger prevents existing audit records from being updated or deleted, protecting the integrity of the ticket history.

### Polling instead of real-time infrastructure

SLA alerts currently use frontend polling and backend lazy evaluation. This avoids the additional infrastructure required for WebSockets, SSE, or background queues while still satisfying the assignment requirements.
