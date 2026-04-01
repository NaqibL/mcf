-- Migration: upgrade embedding columns from vector(384) to vector(768)
-- Required when switching from BAAI/bge-small-en-v1.5 to BAAI/bge-base-en-v1.5.
--
-- Run order:
--   1. Run this file against your Supabase/Postgres instance FIRST.
--   2. Then trigger the "Re-embed Jobs" GitHub Action (or: uv run mcf re-embed --db-url $DATABASE_URL).
--   3. Then run the CREATE INDEX statements at the bottom of this file.
--
-- During the window between steps 1 and 2, vector search returns no results
-- (embedding IS NULL for all rows). The API stays up but matches are empty
-- until re-embed completes.

-- 1. Drop HNSW indexes — must be removed before column type change
DROP INDEX IF EXISTS idx_job_embeddings_vector;
DROP INDEX IF EXISTS idx_candidate_embeddings_vector;

-- 2. Drop and recreate job_embeddings vector column at 768 dims
ALTER TABLE job_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE job_embeddings ADD COLUMN embedding vector(768);

-- 3. Drop and recreate candidate_embeddings vector column at 768 dims
--    This invalidates stored resume/taste embeddings — users must re-upload their resume.
ALTER TABLE candidate_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE candidate_embeddings ADD COLUMN embedding vector(768);

-- ─── Run re-embed BEFORE the statements below ────────────────────────────────
-- uv run mcf re-embed --db-url $DATABASE_URL
--
-- Then run these to restore fast vector search:

-- 4. Rebuild HNSW index on job_embeddings (run after re-embed completes)
-- CREATE INDEX IF NOT EXISTS idx_job_embeddings_vector
--   ON job_embeddings
--   USING hnsw (embedding vector_cosine_ops);

-- 5. Rebuild index on candidate_embeddings (optional — small table)
-- CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_vector
--   ON candidate_embeddings
--   USING hnsw (embedding vector_cosine_ops);
