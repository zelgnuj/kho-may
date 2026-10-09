-- Camera Cabinet: đồng bộ dữ liệu theo tài khoản (local-first).
-- Mỗi bản ghi của app (máy, ảnh, giá, nhật ký, wishlist, cuộn film, cài đặt) là một dòng.
-- Xung đột: bản nào có updated_at (thời điểm sửa trên máy) mới hơn thì thắng.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text        not null check (kind in ('camera', 'price', 'service', 'photo', 'wish', 'roll', 'setting')),
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at bigint      not null,
  deleted    boolean     not null default false,
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);

create index if not exists records_pull_idx on public.records (user_id, server_ts);

alter table public.records enable row level security;

create policy "records: chỉ chủ tài khoản" on public.records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Đẩy nhiều bản ghi một lần; chỉ ghi đè khi bản gửi lên mới hơn bản trên máy chủ.
create or replace function public.sync_push(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.records as r (user_id, kind, id, data, updated_at, deleted, server_ts)
  select auth.uid(), x->>'kind', x->>'id', coalesce(x->'data', '{}'::jsonb),
         (x->>'updated_at')::bigint, coalesce((x->>'deleted')::boolean, false), clock_timestamp()
  from jsonb_array_elements(rows) as x
  on conflict (user_id, kind, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        server_ts = clock_timestamp()
    where r.updated_at <= excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.sync_push(jsonb) from public;
revoke execute on function public.sync_push(jsonb) from anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Ảnh: bucket riêng tư, mỗi người một thư mục {user_id}/...
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "photos: đọc ảnh của mình" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: thêm ảnh của mình" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: sửa ảnh của mình" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: xoá ảnh của mình" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
