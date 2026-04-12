
CREATE TABLE public.company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  content_text TEXT,
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auditors manage own company documents"
ON public.company_documents FOR ALL
USING (
  has_role(auth.uid(), 'auditor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.companies
    WHERE companies.id = company_documents.company_id
    AND companies.auditor_id = auth.uid()
  )
);

CREATE POLICY "Super admin full access to company_documents"
ON public.company_documents FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_company_documents_updated_at
BEFORE UPDATE ON public.company_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('company-files', 'company-files', true);

CREATE POLICY "Auditors can upload company files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-files'
  AND has_role(auth.uid(), 'auditor'::app_role)
);

CREATE POLICY "Auditors can read company files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-files');

CREATE POLICY "Auditors can delete own company files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-files'
  AND has_role(auth.uid(), 'auditor'::app_role)
);
