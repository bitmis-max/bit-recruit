# Nâng cấp DB thật: legacy -> baseline

DB Supabase thật đang ở schema cũ (legacy). Code cần schema của `supabase/migrations/20261023000000_init.sql` rồi `20261110000000_member_roles_terms.sql`.
`20261110_legacy_to_baseline.sql` đưa DB cũ lên đúng baseline, giữ toàn bộ dữ liệu. Chạy **một lần**. Script nằm trong một transaction: lỗi ở đâu thì rollback hết, DB giữ nguyên.

Đã thử trên Supabase local dựng từ `backup/` (số dòng, nội dung dữ liệu và "dấu vân tay" schema đều khớp DB dựng mới từ hai migration). Chưa chạy trên DB thật.

## Script làm gì với dữ liệu

- `application_forms`: mỗi vị trí tuyển một form riêng. Vị trí đầu tiên của đợt giữ form gốc, các vị trí còn lại nhận bản sao form và câu hỏi. `application_answers` được trỏ lại sang câu hỏi của đúng form của vị trí đơn. Không xóa câu trả lời nào.
- `interview_sessions.name` gộp vào `note` rồi bỏ cột. `events.event_date` được sao lưu sang `legacy_archive.events_event_date` (không public) rồi bỏ cột.
- Bỏ policy, function, index, constraint cũ không có trong baseline (vd `is_campaign_open`) và tạo lại đúng baseline.
- Không tạo CLB seed thứ hai (CLB thật giữ nguyên id). Không đụng dữ liệu `auth`, không xóa bucket hay file storage nào. Có gắn trigger `on_auth_user_created` của baseline lên `auth.users`.
- Script tự dừng với thông báo rõ nếu dữ liệu không đúng giả định (vd đợt có nhiều form, ca phỏng vấn chưa có vị trí, `(club_id, user_id)` trùng). Cuối script có bước kiểm tra số dòng và câu trả lời, sai thì rollback.

## Thứ tự chạy trên DB thật

Cần `psql` (PostgreSQL client) hoặc dán file vào Supabase Dashboard, mục SQL Editor. Với `psql`, lấy connection string ở Dashboard, nút Connect, rồi đặt vào biến tạm (đừng dán vào chat):

```powershell
$env:DB_URL = "postgresql://postgres.<ref>:<mật-khẩu>@<host>:5432/postgres"
```

1. Sao lưu lại ngay trước khi chạy (gói Free không tự backup). Bản `backup/` cũ chỉ đủ nếu từ lúc đó chưa có dữ liệu mới.

   ```powershell
   npx supabase db dump --remote -f backup/pre_upgrade_schema.sql
   npx supabase db dump --remote --data-only --use-copy --schema public -f backup/pre_upgrade_data_public.sql
   ```

2. Kiểm tra CLB có owner đang hoạt động và có tài khoản (migration sau cần điều này). Phải trả về 0 dòng:

   ```sql
   select c.id from clubs c
   where not exists (
     select 1 from club_members m
     where m.club_id = c.id and m.role = 'owner' and m.is_active and m.user_id is not null);
   ```

3. Chạy script nâng cấp:

   ```powershell
   psql $env:DB_URL -v ON_ERROR_STOP=1 -f supabase/upgrade/20261110_legacy_to_baseline.sql
   ```

   Thành công khi không có `ERROR` và lệnh cuối là `COMMIT`.

4. Đánh dấu baseline đã áp. Bản CLI này mặc định chạy trên DB local, nên phải có `--remote`:

   ```powershell
   npx supabase migration repair --remote --status applied 20261023000000
   npx supabase migration list --remote
   ```

5. Áp migration còn lại (xem trước bằng `--dry-run`, chỉ có `20261110000000` được liệt kê):

   ```powershell
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   ```

Sau đó xem `docs/HANDOFF.md` cho các việc dashboard còn lại.

## Khôi phục từ backup

Nếu script báo lỗi thì không cần khôi phục (đã rollback). Chỉ khôi phục khi script đã `COMMIT` mà ứng dụng hỏng, hoặc sau khi áp migration 20261110. Thao tác này xóa dữ liệu `public` hiện tại và nạp lại từ dump bước 1. `auth` và `storage` không bị đụng.

1. Lưu đoạn sau vào `restore_objs.sql`:

   ```sql
   drop schema if exists legacy_archive cascade;
   drop trigger if exists on_auth_user_created on auth.users;
   do $$
   declare r record;
   begin
     for r in select tablename from pg_tables where schemaname = 'public' loop
       execute format('drop table public.%I cascade', r.tablename);
     end loop;
     for r in select p.oid::regprocedure as sig from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
       execute format('drop function %s cascade', r.sig);
     end loop;
     for r in select typname from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e' loop
       execute format('drop type public.%I cascade', r.typname);
     end loop;
   end $$;
   ```

2. Chạy (cùng một phiên `psql` để `session_replication_role` có hiệu lực khi nạp dữ liệu), rồi trả lại hai quyền bị thu hồi ở DB cũ:

   ```powershell
   psql $env:DB_URL -v ON_ERROR_STOP=1 `
     -f restore_objs.sql `
     -f backup/pre_upgrade_schema.sql `
     -c "set session_replication_role = replica" `
     -f backup/pre_upgrade_data_public.sql
   psql $env:DB_URL -v ON_ERROR_STOP=1 -c "revoke all on public.google_mail_tokens from anon, authenticated; revoke execute on function public.get_application_by_token(text) from authenticated;"
   ```

   Nếu đã chạy `migration repair`, hoàn tác bằng `npx supabase migration repair --remote --status reverted 20261023000000 20261110000000`.

Cách này đã thử trên local (số dòng, dữ liệu và schema về đúng trạng thái legacy). Trên DB thật, `backup/schema.sql` có vài lệnh cần quyền cao (vd `ALTER PUBLICATION ... OWNER`); nếu `psql` báo lỗi quyền ở các dòng đó thì bỏ dòng đó rồi chạy lại.
