-- Add public event images and limit uploads/removals to each club's admins.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select on storage.objects to anon, authenticated;
grant insert, delete on storage.objects to authenticated;

drop policy if exists "public read event images" on storage.objects;
create policy "public read event images" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'event-images');

drop policy if exists "club admins upload event images" on storage.objects;
create policy "club admins upload event images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and exists (
      select 1
      from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  );

drop policy if exists "club admins delete event images" on storage.objects;
create policy "club admins delete event images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-images'
    and exists (
      select 1
      from public.clubs c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_club_admin(c.id)
    )
  );
