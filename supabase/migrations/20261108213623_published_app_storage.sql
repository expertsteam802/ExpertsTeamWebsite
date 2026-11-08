-- Public, read-only static hosting for user-published workspace builds.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'published-apps',
  'published-apps',
  true,
  52428800,
  array[
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'text/xml',
    'text/plain',
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/x-icon',
    'font/woff',
    'font/woff2',
    'font/ttf',
    'font/otf',
    'application/wasm',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read published app files" on storage.objects;
create policy "Public can read published app files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'published-apps');
