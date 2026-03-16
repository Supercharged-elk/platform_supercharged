-- Tracking de progreso por generación

CREATE TABLE generation_progress (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id  UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
    status         generation_status NOT NULL DEFAULT 'pending',
    progress_pct   INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    stage          TEXT,
    started_at     TIMESTAMPTZ DEFAULT now(),
    completed_at   TIMESTAMPTZ,
    error_message  TEXT
);

ALTER TABLE generation_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select" ON generation_progress
    FOR SELECT USING (
        generation_id IN (
            SELECT id FROM generations WHERE user_id = auth.uid()
        )
    );

-- Service role escribe (el backend actualiza el progreso)
CREATE POLICY "service_role_write" ON generation_progress
    FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX generation_progress_gen_id_idx ON generation_progress(generation_id);
