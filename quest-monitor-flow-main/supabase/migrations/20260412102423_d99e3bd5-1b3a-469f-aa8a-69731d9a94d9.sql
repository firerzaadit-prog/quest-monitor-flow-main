CREATE OR REPLACE FUNCTION public.get_public_audit_status(_company_slug text)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  has_ongoing_audit boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.company_name,
    EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.company_id = c.id
        AND a.status = 'ongoing'
    ) AS has_ongoing_audit
  FROM public.companies c
  WHERE c.slug = _company_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_audit_status(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_audit_status(text) TO authenticated;