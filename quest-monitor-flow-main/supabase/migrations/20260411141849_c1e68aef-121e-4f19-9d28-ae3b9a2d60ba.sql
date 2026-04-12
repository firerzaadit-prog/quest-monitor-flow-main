
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'auditor', 'divisi');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name TEXT NOT NULL,
  industry TEXT,
  address TEXT,
  contact_person TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Divisi table
CREATE TABLE public.divisi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.divisi ENABLE ROW LEVEL SECURITY;

-- Audits table
CREATE TABLE public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  divisi_id UUID REFERENCES public.divisi(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;

-- Audit questions table
CREATE TABLE public.audit_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text TEXT NOT NULL,
  category TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_questions ENABLE ROW LEVEL SECURITY;

-- Audit answers table
CREATE TABLE public.audit_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.audit_questions(id) ON DELETE CASCADE NOT NULL,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_answers ENABLE ROW LEVEL SECURITY;

-- Audit reports table
CREATE TABLE public.audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES public.audits(id) ON DELETE CASCADE NOT NULL UNIQUE,
  findings TEXT,
  recommendations TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_reports ENABLE ROW LEVEL SECURITY;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_divisi_updated_at BEFORE UPDATE ON public.divisi FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- user_roles: super_admin full access, users can read own
CREATE POLICY "Super admin full access to user_roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- profiles: super_admin full access, users can read/update own
CREATE POLICY "Super admin full access to profiles" ON public.profiles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- companies: super_admin full, auditor own
CREATE POLICY "Super admin full access to companies" ON public.companies FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Auditors manage own companies" ON public.companies FOR ALL USING (public.has_role(auth.uid(), 'auditor') AND auth.uid() = auditor_id);

-- divisi: super_admin full, auditor own, divisi own
CREATE POLICY "Super admin full access to divisi" ON public.divisi FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Auditors manage own divisi" ON public.divisi FOR ALL USING (public.has_role(auth.uid(), 'auditor') AND auth.uid() = auditor_id);
CREATE POLICY "Divisi can read own record" ON public.divisi FOR SELECT USING (public.has_role(auth.uid(), 'divisi') AND auth.uid() = user_id);

-- audits: super_admin full, auditor via divisi, divisi own
CREATE POLICY "Super admin full access to audits" ON public.audits FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Auditors access own audits" ON public.audits FOR ALL USING (
  public.has_role(auth.uid(), 'auditor') AND
  EXISTS (SELECT 1 FROM public.divisi WHERE divisi.id = audits.divisi_id AND divisi.auditor_id = auth.uid())
);
CREATE POLICY "Divisi access own audits" ON public.audits FOR ALL USING (
  public.has_role(auth.uid(), 'divisi') AND
  EXISTS (SELECT 1 FROM public.divisi WHERE divisi.id = audits.divisi_id AND divisi.user_id = auth.uid())
);

-- audit_questions: readable by all authenticated
CREATE POLICY "Authenticated users can read questions" ON public.audit_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage questions" ON public.audit_questions FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- audit_answers: same pattern as audits
CREATE POLICY "Super admin full access to answers" ON public.audit_answers FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Auditors access own answers" ON public.audit_answers FOR ALL USING (
  public.has_role(auth.uid(), 'auditor') AND
  EXISTS (
    SELECT 1 FROM public.audits a
    JOIN public.divisi d ON d.id = a.divisi_id
    WHERE a.id = audit_answers.audit_id AND d.auditor_id = auth.uid()
  )
);
CREATE POLICY "Divisi access own answers" ON public.audit_answers FOR ALL USING (
  public.has_role(auth.uid(), 'divisi') AND
  EXISTS (
    SELECT 1 FROM public.audits a
    JOIN public.divisi d ON d.id = a.divisi_id
    WHERE a.id = audit_answers.audit_id AND d.user_id = auth.uid()
  )
);

-- audit_reports: same pattern
CREATE POLICY "Super admin full access to reports" ON public.audit_reports FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Auditors access own reports" ON public.audit_reports FOR ALL USING (
  public.has_role(auth.uid(), 'auditor') AND
  EXISTS (
    SELECT 1 FROM public.audits a
    JOIN public.divisi d ON d.id = a.divisi_id
    WHERE a.id = audit_reports.audit_id AND d.auditor_id = auth.uid()
  )
);
CREATE POLICY "Divisi access own reports" ON public.audit_reports FOR SELECT USING (
  public.has_role(auth.uid(), 'divisi') AND
  EXISTS (
    SELECT 1 FROM public.audits a
    JOIN public.divisi d ON d.id = a.divisi_id
    WHERE a.id = audit_reports.audit_id AND d.user_id = auth.uid()
  )
);

-- Seed some default audit questions
INSERT INTO public.audit_questions (question_text, category, sort_order) VALUES
('Apakah perusahaan memiliki kebijakan tata kelola IT yang terdokumentasi?', 'Tata Kelola IT', 1),
('Apakah terdapat struktur organisasi IT yang jelas dengan pembagian tugas dan tanggung jawab?', 'Tata Kelola IT', 2),
('Apakah perusahaan memiliki rencana strategis IT yang selaras dengan tujuan bisnis?', 'Perencanaan Strategis', 3),
('Bagaimana proses pengelolaan risiko IT dilakukan di perusahaan?', 'Manajemen Risiko', 4),
('Apakah terdapat prosedur backup dan recovery data yang terdokumentasi?', 'Keamanan Data', 5),
('Apakah perusahaan menerapkan kontrol akses yang memadai untuk sistem informasi?', 'Keamanan Data', 6),
('Bagaimana proses pengembangan dan pemeliharaan sistem aplikasi dilakukan?', 'Pengembangan Sistem', 7),
('Apakah terdapat prosedur change management yang formal?', 'Pengembangan Sistem', 8),
('Apakah perusahaan memiliki Business Continuity Plan (BCP) dan Disaster Recovery Plan (DRP)?', 'Kontinuitas Bisnis', 9),
('Bagaimana perusahaan memastikan kepatuhan terhadap regulasi terkait IT?', 'Kepatuhan', 10);
