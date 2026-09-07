# AI prompts

Here are the key prompts used during the development of this ticketing system, grouped by the specific goals and debugging sessions.

## 1. Initial Architecture & Scaffolding

### Prompt
> "I need to build a customer support ticketing system with Next.js, Express, and Prisma. The first goal is role-based access. Supervisors should see all tickets, but Agents should only see tickets assigned to them or where they are a collaborator. Help me design the Prisma schema and the initial backend API to support this."

### What I got
The AI provided a solid initial `schema.prisma` with `User`, `Ticket`, and `TicketCollaborator` models, and wrote the Express routes with a reusable `canAgentActOnTicket` helper function.

### What I corrected
The AI initially forgot to include the `collaborators` relation in the Prisma `include` block when fetching tickets, which caused a type error on the frontend. I pointed out the error and it added the correct nested include.

## 2. Status Transitions (Goal 4)

### Prompt
> "I need to enforce legal status transitions for tickets (e.g., NEW -> OPEN, OPEN -> RESOLVED). The UI should only show legal options, but the real enforcement must happen on the server."

### What I got
The AI wrote an object mapping allowed transitions and added a validation check inside the `updateTicketStatus` controller to throw a 400 error if an invalid transition was attempted.

### What I corrected
The AI completely missed the SLA pausing logic. I had to tell it: "You forgot the PENDING state rule. When a ticket moves to PENDING, we need to pause the SLA clock by recording a `pendingEnteredAt` timestamp, and then adjust `slaTargetAt` when it moves back to OPEN."

## 3. Internal Notes (Goal 5)

### Prompt
> "Agents should be able to post internal notes that customers can't see, alongside regular public replies. How should we model this in the database?"

### What I got
The AI suggested a `TicketReply` model with an `isInternal` boolean flag, and wrote the frontend UI to have a toggle switch for "Internal Note".

### What I corrected
The AI wrote the backend endpoint to return *all* replies, and suggested filtering out `isInternal == true` on the frontend for customers. I immediately corrected this to filter them out securely on the backend query itself so the data never leaves the server.

## 4. Bulk Actions (Goal 6)

### Prompt
> "Supervisors need to be able to select multiple tickets from the grid and assign them all to a specific agent at once. Write the API endpoint for this."

### What I got
The AI wrote a `POST /api/tickets/bulk/reassign` endpoint that ran a simple `for` loop over the ticket IDs, calling `prisma.ticket.update` one by one, and returned a list of success/failure results for each ticket.

### What I corrected
The AI originally didn't check if the agent had permission to act on the ticket before assigning it in the bulk loop. I had to add the `canAgentActOnTicket(user, existingTicket)` permission check inside the loop so agents couldn't hijack tickets they don't own.

## 5. CSV Export (Goal 7)

### Prompt
> "Add a button to export the current ticket list to a CSV. It needs to respect the current filters (status, search query, etc.) applied on the grid."

### What I got
The AI wrote the Express endpoint (`exportTicketsCsv`) and correctly parsed the query parameters to build the Prisma `where` clause. It then built the CSV string manually by iterating over the rows and pushing comma-separated values.

### What I corrected
The AI initially just joined fields with commas, which broke when a ticket subject contained commas. I told it to write an `escapeCsv` function that wraps fields in double-quotes if they contain commas or newlines.

## 6. Implementing Goal 8 (Analytics Dashboard) - *The Bad Output*

### Prompt
> "lets implement goal 8 give a structued paln for it"

### What I got
The AI generated a plan for the analytics dashboard, but it made two critical mistakes:
1. It wanted to use a raw SQL query (`$queryRaw`) with `date_trunc('week', resolvedAt)` to calculate the 8-week resolution chart, which was unnecessarily complex.
2. It wrote the SLA breach counter as just `slaTargetAt < NOW`, forgetting that tickets in `PENDING` status have their SLA clock paused.

### What I corrected
I explicitly told the AI to reverse its decisions before writing code:
> "Before implementing Goal 8, address the following: Bug fix: The breaching-tickets count must exclude PENDING status... Skip $queryRaw for the 8-week chart — fetch resolved tickets from the last 8 weeks via a standard Prisma query and bucket them in JavaScript..."

## 7. Archiving Scope (Goal 9)

### Prompt
> "We added an `isArchived` flag to the Ticket model so supervisors can archive old tickets. How do we ensure these archived tickets don't clutter the UI?"

### What I got
The AI wrote the `PATCH /tickets/:id/archive` endpoint to flip the boolean flag, and added a button to the frontend to trigger it.

### What I corrected
The AI forgot to update the main `GET /tickets` query. I had to remind it to add `isArchived: false` to the default ticket queue fetch (unless a specific `isArchived=true` filter is passed) so the archived tickets actually disappear from the main dashboard.

## 8. Fixing the Database Connection Pool (P2028 Error)

### Prompt
> "PrismaClientKnownRequestError: Invalid `prisma.ticket.count()` invocation ... Transaction API error: Unable to start a transaction in the given time... whats this error"

### What I got
The AI correctly identified that running `prisma.$transaction` with 7 concurrent read queries for the Analytics dashboard, combined with a new 30-second polling fetch, was exhausting the Supabase free-tier connection pool.

### What I corrected
The AI suggested and implemented the fix perfectly on the first try: replacing the `$transaction` blocks with `Promise.all` since read-only aggregations don't strictly require transactional consistency at this scale.

## 9. Polishing the SLA Alerts UI (Goal 10)

### Prompt
> "there is a small bug when I am opening teh sla alerts and aknowleging them the red small dot in the sla button is not dissaperaing, check it"

### What I got
The AI realized that while the specific alert row was being removed from the child component's state instantly, the parent `page.tsx` badge count was only updating during its 30-second background poll.

### What I corrected
The AI added an `onAlertAcknowledged` callback to the component to instantly decrement the badge count in the parent state. No further corrections were needed.
