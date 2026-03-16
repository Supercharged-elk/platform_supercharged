-- Organizaciones / clientes

CREATE TABLE organizations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    plan_type    plan_type NOT NULL DEFAULT 'free',
    api_token    TEXT UNIQUE,           -- para clientes enterprise B2B
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: solo service_role puede leer/escribir (no expuesto a usuarios directamente)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON organizations
    FOR ALL USING (auth.role() = 'service_role');
