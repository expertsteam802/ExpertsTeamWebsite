-- Allow members to share downloadable resources by URL without uploading a copy.
ALTER TABLE public.files
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

ALTER TABLE public.files
  ADD CONSTRAINT files_source_url_https_check
  CHECK (source_url IS NULL OR source_url ~* '^https://')
  NOT VALID;

ALTER TABLE public.files
  VALIDATE CONSTRAINT files_source_url_https_check;

-- Let video owners customize the card thumbnail and player alignment.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS player_alignment text NOT NULL DEFAULT 'center';

ALTER TABLE public.videos
  ADD CONSTRAINT videos_player_alignment_check
  CHECK (player_alignment IN ('left', 'center', 'right'))
  NOT VALID;

ALTER TABLE public.videos
  VALIDATE CONSTRAINT videos_player_alignment_check;
