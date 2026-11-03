-- A malformed legacy relation named "public.community_posts" is separate
-- from the real public.community_posts table. It has no RLS policies.
-- Remove client privileges without dropping it or touching community data.
REVOKE ALL ON TABLE public."public.community_posts" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."public.community_posts_id_seq" FROM PUBLIC, anon, authenticated;
