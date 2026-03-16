-- Historial de generaciones

CREATE TABLE generations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
    workflow_id     UUID REFERENCES workflows(id) ON DELETE SET NULL,
    user_prompt     TEXT,
    final_prompt    TEXT,
    image_url       TEXT,
    video_url       TEXT,
    model_used      TEXT,
    mode            generation_mode NOT NULL,
    reference_count INTEGER DEFAULT 0,
    parent_id       UUID REFERENCES generations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON generations
    FOR ALL USING (auth.uid() = user_id);

-- Índices para queries frecuentes
CREATE INDEX generations_user_id_idx ON generations(user_id);
CREATE INDEX generations_workflow_id_idx ON generations(workflow_id);
CREATE INDEX generations_created_at_idx ON generations(created_at DESC);
