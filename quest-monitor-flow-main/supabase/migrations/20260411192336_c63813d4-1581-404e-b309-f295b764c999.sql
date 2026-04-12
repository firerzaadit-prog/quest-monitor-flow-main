-- Drop the existing divisi policy (SELECT only) and replace with one that includes INSERT
DROP POLICY IF EXISTS "Divisi access own reports" ON public.audit_reports;

CREATE POLICY "Divisi read own reports"
ON public.audit_reports FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'divisi'::app_role) AND EXISTS (
    SELECT 1 FROM audits a JOIN divisi d ON d.id = a.divisi_id
    WHERE a.id = audit_reports.audit_id AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Divisi insert own reports"
ON public.audit_reports FOR INSERT
TO public
WITH CHECK (
  has_role(auth.uid(), 'divisi'::app_role) AND EXISTS (
    SELECT 1 FROM audits a JOIN divisi d ON d.id = a.divisi_id
    WHERE a.id = audit_reports.audit_id AND d.user_id = auth.uid()
  )
);