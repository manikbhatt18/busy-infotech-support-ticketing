# Plan

- **How did you break the work into sessions?**
  I broke the work into 5 logical sessions aligned with the 10 goals. Session 1 is foundational (schema, database choices, roles, auth). Session 2 focuses on core entities (Tickets/Replies). Session 3 covers lifecycle (state machine, collaborators). Session 4 handles queue mechanics (search, bulk, alerts). Session 5 wraps up with dashboards and the immutable audit log.
- **What order did you build in, and why that order?**
  I started with data modeling and decision documentation, as this foundation supports all business rules. The next step is scaffolding the projects and implementing Goal 1 (Auth and Roles) because every subsequent feature depends on having an authenticated actor in the system.
- **What did you estimate versus what it actually took?**
  *Session 1 (Schema & Foundation) Estimate:* 4 hours. *Actual:* ~5 hours.
  *Session 2 (Core Entities) Estimate:* 2 hours. *Actual:* ~2.5 hours.
  *Session 3 & 4 (Lifecycle, Queues, SLA) Estimate:* 4.5 hours. *Actual:* ~5 hours.
  *Session 5 (Timeline & Redesign) Estimate:* 3.5 hours. *Actual:* ~6.5 hours (We successfully implemented the backend Audit Log, completely redesigned the UI to match modern SaaS standards, and interleaved the backend timeline events into the live conversation feed).
  *Total Actual Time:* ~19 hours.
- **What did you cut when you ran short?**
  No required functionality was removed, but I intentionally chose simpler implementations in a few places:

- Search uses Prisma's case-insensitive `contains` filtering instead of PostgreSQL full-text search or a dedicated search engine.
- SLA calculations use timestamp-based pause/resume logic rather than business-hour calendars.
- SLA alerts use lightweight polling instead of WebSockets or Server-Sent Events.
- Analytics are calculated on demand rather than using materialized views or pre-computed aggregates.

