CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  qnum integer NOT NULL,
  type text NOT NULL CHECK (type IN ('verbal','quantitative')),
  skill_id text NOT NULL,
  text text NOT NULL,
  opt1 text NOT NULL,
  opt2 text NOT NULL,
  opt3 text NOT NULL,
  opt4 text NOT NULL,
  ans integer NOT NULL CHECK (ans BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_public_read"   ON public.questions FOR SELECT USING (true);
CREATE POLICY "questions_public_insert" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "questions_public_update" ON public.questions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "questions_public_delete" ON public.questions FOR DELETE USING (true);

CREATE INDEX idx_questions_qnum ON public.questions(qnum);