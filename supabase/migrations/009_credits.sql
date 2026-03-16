-- Créditos por usuario u organización

CREATE TABLE credits (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
    generate_credits INTEGER NOT NULL DEFAULT 0 CHECK (generate_credits >= 0),
    edit_credits     INTEGER NOT NULL DEFAULT 0 CHECK (edit_credits >= 0),
    animate_credits  INTEGER NOT NULL DEFAULT 0 CHECK (animate_credits >= 0),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT credits_owner_check CHECK (
        (user_id IS NOT NULL AND organization_id IS NULL) OR
        (user_id IS NULL AND organization_id IS NOT NULL)
    )
);

ALTER TABLE credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_credits" ON credits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "service_role_all" ON credits
    FOR ALL USING (auth.role() = 'service_role');

CREATE TRIGGER credits_updated_at
    BEFORE UPDATE ON credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE UNIQUE INDEX credits_user_id_idx ON credits(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX credits_org_id_idx ON credits(organization_id) WHERE organization_id IS NOT NULL;
