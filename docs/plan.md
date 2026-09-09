# Plan

- **How did you break the work into sessions?**
  I am breaking the work into 5 logical sessions aligned with the 10 goals. Session 1 is foundational (schema, database choices, roles, auth). Session 2 focuses on core entities (Tickets/Replies). Session 3 covers lifecycle (state machine, collaborators). Session 4 handles queue mechanics (search, bulk, alerts). Session 5 wraps up with dashboards and the immutable audit log.
- **What order did you build in, and why that order?**
  I started with data modeling and decision documentation, as this foundation supports all business rules. The next step is scaffolding the projects and implementing Goal 1 (Auth and Roles) because every subsequent feature depends on having an authenticated actor in the system.
- **What did you estimate versus what it actually took?**
  *Session 1 (Schema & Foundation) Estimate:* 2 hours. *Actual:* ~2.5 hours.
  *Session 2 (Core Entities) Estimate:* 1 hour. *Actual:* ~1.5 hours.
  *Session 3 & 4 (Lifecycle, Queues, SLA) Estimate:* 3 hours. *Actual:* ~3.5 hours.
  *Session 5 (Timeline & Redesign) Estimate:* 2 hours. *Actual:* ~3 hours (We successfully implemented the backend Audit Log, completely redesigned the UI to match modern SaaS standards, and interleaved the backend timeline events into the live conversation feed).
  *Total Actual Time:* ~10.5 hours.
- **What did you cut when you ran short?**
  We didn't cut any of the required backend functionality, but we did make practical scoping choices:
  - Complex search was implemented via Prisma's native `contains` operator (case-insensitive) instead of a dedicated search index (e.g. ElasticSearch/Typesense).
  - The SLA pause logic was implemented via simple timestamp math rather than complex schedule calculations (e.g., business hours vs weekends).
  - The initial timeline implementation was purely backend, but we successfully circled back to implement it fully in the UI conversation feed.
