-- Goal 5: Add collaboratorId to AuditTimeline + two new AuditEventType values
-- Also names both User→AuditTimeline relations explicitly (ActorAudit, CollaboratorAudit)
-- to prevent Prisma ambiguous-relation error when regenerating the client.
-- NOTE: This is DDL only — no DML is touched, so the existing
--       UPDATE/DELETE lockdown trigger on AuditTimeline is unaffected.

-- AlterEnum: add COLLABORATOR_ADDED and COLLABORATOR_REMOVED
ALTER TYPE "AuditEventType" ADD VALUE 'COLLABORATOR_ADDED';
ALTER TYPE "AuditEventType" ADD VALUE 'COLLABORATOR_REMOVED';

-- AlterTable: add nullable collaboratorId column to AuditTimeline
ALTER TABLE "AuditTimeline" ADD COLUMN "collaboratorId" TEXT;

-- AddForeignKey: collaboratorId → User(id)  ON DELETE SET NULL
ALTER TABLE "AuditTimeline" ADD CONSTRAINT "AuditTimeline_collaboratorId_fkey"
    FOREIGN KEY ("collaboratorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
