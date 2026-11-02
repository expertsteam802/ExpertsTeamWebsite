ALTER TABLE public.ai_chats
  ADD COLUMN IF NOT EXISTS thread_id uuid;

UPDATE public.ai_chats
SET thread_id = gen_random_uuid()
WHERE thread_id IS NULL;

ALTER TABLE public.ai_chats
  ALTER COLUMN thread_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ai_chats_thread_user_created_idx
  ON public.ai_chats (user_id, thread_id, created_at ASC);
