-- Create function to prevent modifications
CREATE OR REPLACE FUNCTION prevent_audit_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AuditTimeline records cannot be updated or deleted.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to AuditTimeline for UPDATE and DELETE
CREATE TRIGGER trg_prevent_audit_modifications
BEFORE UPDATE OR DELETE ON "AuditTimeline"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_modifications();