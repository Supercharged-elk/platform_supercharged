-- Enums compartidos por toda la plataforma

CREATE TYPE plan_type AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE generation_mode AS ENUM ('generate', 'edit', 'video', 'multi_ref');
CREATE TYPE generation_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE provider_type AS ENUM ('replicate', 'openai');
