-- Workflows de React Flow guardados por usuario

CREATE TABLE workflows (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    name       TEXT NOT NULL DEFAULT 'Untitled Workflow',
    graph_json JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    is_public  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

-- Propietario: acceso completo
CREATE POLICY "owner_all" ON workflows
    FOR ALL USING (auth.uid() = user_id);

-- Workflows públicos: lectura por cualquier usuario autenticado
CREATE POLICY "public_select" ON workflows
    FOR SELECT USING (is_public = true AND auth.role() = 'authenticated');

CREATE TRIGGER workflows_updated_at
    BEFORE UPDATE ON workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
