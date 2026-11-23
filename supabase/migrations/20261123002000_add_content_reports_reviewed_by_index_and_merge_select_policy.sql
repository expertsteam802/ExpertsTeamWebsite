-- Add the missing reviewer foreign-key index and merge equivalent SELECT policies.
-- The combined policy preserves the exact previous access rule:
-- admins can review all reports; members can view only their own reports.
CREATE INDEX IF NOT EXISTS content_reports_reviewed_by_idx
  ON public.content_reports (reviewed_by);

DROP POLICY IF EXISTS "Admins review content reports" ON public.content_reports;
DROP POLICY IF EXISTS "Members view own content reports" ON public.content_reports;

CREATE POLICY "Admins and members view content reports"
  ON public.content_reports
  FOR SELECT
  TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR reporter_id = (SELECT auth.uid())
  );

NOTIFY pgrst, 'reload schema';
