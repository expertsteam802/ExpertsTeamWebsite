-- Publishing uses the authenticated project owner instead of a service-role upload.
-- The bucket remains public for reading published assets; writes are scoped to the owner's folder.

create policy "Users can publish their own app files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'published-apps'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
