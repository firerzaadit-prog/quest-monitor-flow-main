ALTER TABLE public.audits 
  ADD COLUMN duration_minutes INTEGER,
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ;