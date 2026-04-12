
-- Add slug column to companies table
ALTER TABLE public.companies ADD COLUMN slug text;

-- Create unique index on slug
CREATE UNIQUE INDEX idx_companies_slug ON public.companies (slug);

-- Generate slugs for existing companies
UPDATE public.companies 
SET slug = lower(regexp_replace(regexp_replace(company_name, '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g'))
WHERE slug IS NULL;

-- Make slug NOT NULL after populating
ALTER TABLE public.companies ALTER COLUMN slug SET NOT NULL;

-- Add public SELECT policy for anonymous access to resolve slug
CREATE POLICY "Public can read company slug and name"
ON public.companies
FOR SELECT
TO anon
USING (true);
