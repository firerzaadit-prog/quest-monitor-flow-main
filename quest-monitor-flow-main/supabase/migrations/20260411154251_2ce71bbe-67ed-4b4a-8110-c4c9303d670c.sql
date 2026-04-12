
CREATE POLICY "Authenticated can read company slug and name"
ON public.companies FOR SELECT TO authenticated
USING (true);

UPDATE public.companies 
SET slug = trim(both '-' from regexp_replace(
  regexp_replace(
    regexp_replace(lower(company_name), '\s+', '-', 'g'),
    '[^a-z0-9-]', '', 'g'
  ),
  '-+', '-', 'g'
))
WHERE slug LIKE '--%' OR slug LIKE '%--%' OR slug LIKE '%---%';
