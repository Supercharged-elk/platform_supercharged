-- Proyectos dentro de una organización

CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo ven proyectos de su organización
CREATE POLICY "org_members_select" ON projects
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM user_profiles WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "org_admins_write" ON projects
    FOR ALL USING (
        organization_id IN (
            SELECT organization_id FROM user_profiles
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );
