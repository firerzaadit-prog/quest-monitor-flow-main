CREATE POLICY "Auditors can read divisi profiles"
ON public.profiles FOR SELECT
USING (
  has_role(auth.uid(), 'auditor'::app_role) 
  AND EXISTS (
    SELECT 1 FROM public.divisi 
    WHERE divisi.user_id = profiles.user_id 
    AND divisi.auditor_id = auth.uid()
  )
);