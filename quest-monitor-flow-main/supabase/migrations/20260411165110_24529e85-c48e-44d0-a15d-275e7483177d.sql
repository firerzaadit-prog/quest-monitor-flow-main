
ALTER TABLE public.audit_answers
  ADD COLUMN file_url TEXT,
  ADD COLUMN file_name TEXT,
  ADD COLUMN file_type TEXT;

-- Create audit-files storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-files', 'audit-files', true);

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload audit files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audit-files');

-- Allow authenticated users to read audit files
CREATE POLICY "Authenticated users can read audit files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audit-files');

-- Allow authenticated users to delete their own audit files
CREATE POLICY "Authenticated users can delete audit files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audit-files');
