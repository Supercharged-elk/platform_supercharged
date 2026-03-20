-- Add prediction_id to generations for tracking Replicate predictions
-- from Next.js API routes (canvas-nextjs-migration)
ALTER TABLE generations ADD COLUMN IF NOT EXISTS prediction_id TEXT;
