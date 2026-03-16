-- Support user-owned and organization-owned generations

ALTER TABLE generations
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE generations
    ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'generations_owner_check'
          AND conrelid = 'generations'::regclass
    ) THEN
        ALTER TABLE generations
            ADD CONSTRAINT generations_owner_check CHECK (
                (user_id IS NOT NULL AND organization_id IS NULL) OR
                (user_id IS NULL AND organization_id IS NOT NULL)
            );
    END IF;
END
$$;

DROP POLICY IF EXISTS "owner_all" ON generations;

CREATE POLICY "owner_user_all" ON generations
    FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "org_member_select" ON generations
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id
            FROM user_profiles
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "service_role_all" ON generations
    FOR ALL
    USING (auth.role() = 'service_role');
