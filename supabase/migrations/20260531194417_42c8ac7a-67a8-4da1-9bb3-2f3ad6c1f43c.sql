CREATE TABLE public.admins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admins TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admins TO authenticated;
GRANT ALL ON public.admins TO service_role;

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_public_read   ON public.admins FOR SELECT USING (true);
CREATE POLICY admins_public_insert ON public.admins FOR INSERT WITH CHECK (true);
CREATE POLICY admins_public_update ON public.admins FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY admins_public_delete ON public.admins FOR DELETE USING (true);

INSERT INTO public.admins (name, code) VALUES ('المشرف الرئيسي', '1000000000');