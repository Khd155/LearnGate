
-- Students
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO anon, authenticated;
GRANT ALL ON public.students TO service_role;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_public_read"   ON public.students FOR SELECT USING (true);
CREATE POLICY "students_public_insert" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "students_public_update" ON public.students FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "students_public_delete" ON public.students FOR DELETE USING (true);

-- Plans
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active')),
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE INDEX plans_student_id_idx ON public.plans(student_id);
CREATE INDEX plans_status_idx     ON public.plans(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_public_read"   ON public.plans FOR SELECT USING (true);
CREATE POLICY "plans_public_insert" ON public.plans FOR INSERT WITH CHECK (true);
CREATE POLICY "plans_public_update" ON public.plans FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "plans_public_delete" ON public.plans FOR DELETE USING (true);
