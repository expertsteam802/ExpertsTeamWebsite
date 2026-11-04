CREATE OR REPLACE FUNCTION public.record_video_view(p_video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.videos
  SET views = COALESCE(views, 0) + 1
  WHERE id = p_video_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_video_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_video_view(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
