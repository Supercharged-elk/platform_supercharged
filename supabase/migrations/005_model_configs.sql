-- Configuración de modelos AI por proyecto

CREATE TABLE model_configs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider             provider_type NOT NULL DEFAULT 'replicate',
    model_ref            TEXT NOT NULL,        -- e.g. "black-forest-labs/flux-1.1-pro"
    model_version        TEXT,                 -- hash de versión específica (opcional)
    trigger_word         TEXT,                 -- e.g. "ELKANO" para LoRA
    display_name         TEXT NOT NULL,
    default_params       JSONB NOT NULL DEFAULT '{}',
    active               BOOLEAN NOT NULL DEFAULT true,
    use_enrichment       BOOLEAN NOT NULL DEFAULT false,
    brand_rules          TEXT,
    negative_constraints TEXT,
    brand_tone           TEXT,
    quality_bar          TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select" ON model_configs
    FOR SELECT USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_profiles up ON up.organization_id = p.organization_id
            WHERE up.user_id = auth.uid()
        )
    );

CREATE POLICY "org_admins_write" ON model_configs
    FOR ALL USING (
        project_id IN (
            SELECT p.id FROM projects p
            JOIN user_profiles up ON up.organization_id = p.organization_id
            WHERE up.user_id = auth.uid() AND up.role IN ('owner', 'admin')
        )
    );
