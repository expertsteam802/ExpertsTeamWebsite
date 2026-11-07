-- Store site background images in a dedicated public bucket.
-- Only admins can upload, replace, or remove files; visitors can read images.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-assets',
  'site-assets',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view site assets" ON storage.objects;
CREATE POLICY "Public can view site assets"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'site-assets');

DROP POLICY IF EXISTS "Admins can upload site assets" ON storage.objects;
CREATE POLICY "Admins can upload site assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-assets'
  AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can update site assets" ON storage.objects;
CREATE POLICY "Admins can update site assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'site-assets'
  AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'site-assets'
  AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can delete site assets" ON storage.objects;
CREATE POLICY "Admins can delete site assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'site-assets'
  AND public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
);
