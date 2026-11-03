-- Increment a video's view count only when the embedded player reports PLAYING.
CREATE OR REPLACE FUNCTION public.record_video_view(p_video_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_views integer;
BEGIN
  UPDATE public.videos SET views = views + 1
  WHERE id = p_video_id
  RETURNING views INTO new_views;
  IF new_views IS NULL THEN RAISE EXCEPTION 'Video not found'; END IF;
  RETURN new_views;
END;
$$;
REVOKE ALL ON FUNCTION public.record_video_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_video_view(uuid) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
