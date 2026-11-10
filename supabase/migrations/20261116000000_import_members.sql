-- Import danh sách thành viên từ Excel/CSV (Đợt 5).
-- Xem docs/CONTRACT.md (mục 1) và docs/database.md (mục 6.7).
--   * import_members(p_club_id, p_rows) returns jsonb
-- Client không insert/update trực tiếp club_members khi import; toàn bộ việc ghi
-- nằm trong một lần gọi hàm (một transaction: lỗi ở bất kỳ dòng nào thì không
-- ghi gì). Không đổi bảng.

begin;

create or replace function public.import_members(
  p_club_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max_rows constant int := 1000;
  c_email_re constant text := '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$';  -- như submit_application
  c_fb_re constant text := '^https://(www\.|m\.|web\.)?(facebook|fb)\.com/.+';    -- như check của club_members
  c_keys constant text[] := array[
    'full_name', 'student_code', 'class_name', 'email', 'phone', 'facebook_url', 'team', 'title'
  ];

  v_is_head boolean;
  v_cur int;                 -- số dòng đang xử lý (cho tiền tố "Dòng N: ")
  v_total int;
  v_n int;
  v_row jsonb;
  v_f jsonb;
  v_k text;
  v_val jsonb;
  v_txt text;
  v_limit int;

  v_name text;
  v_code text;
  v_email text;
  v_team_name text;
  v_team_id uuid;

  v_seen_code jsonb := '{}';   -- MSSV -> số dòng đã dùng trong file
  v_seen_email jsonb := '{}';  -- email -> số dòng đã dùng trong file
  v_team_cache jsonb := '{}';  -- tên ban viết thường -> team_id
  v_prev int;

  v_code_id uuid;
  v_email_id uuid;
  v_m public.club_members%rowtype;

  v_class text;
  v_phone text;
  v_fb text;
  v_title text;
  v_new_email text;
  v_new_team uuid;
  v_staff boolean;

  v_inserted int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_staff_skipped int := 0;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập để import thành viên';
  end if;

  if p_club_id is null or not public.has_club_permission(p_club_id, 'members') then
    raise exception 'Bạn không có quyền import thành viên cho CLB này';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Dữ liệu import phải là một danh sách các dòng';
  end if;

  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'Không có dòng nào để import';
  end if;
  if v_total > c_max_rows then
    raise exception 'Tối đa % dòng mỗi lần import (file có % dòng)', c_max_rows, v_total;
  end if;

  v_is_head := public.is_club_head(p_club_id);

  -- Hai lần import cùng CLB không chạy đồng thời (tránh ghép trùng thành viên).
  perform pg_advisory_xact_lock(hashtextextended('import_members:' || p_club_id::text, 0));

  begin
    for v_n in 1..v_total loop
      v_cur := v_n;
      v_row := p_rows -> (v_n - 1);

      -- ---- Kiểm tra dữ liệu dòng ----
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'Dòng %: dữ liệu dòng không hợp lệ', v_n;
      end if;

      v_f := '{}';
      foreach v_k in array c_keys loop
        v_val := v_row -> v_k;
        v_txt := null;
        if v_val is not null and jsonb_typeof(v_val) <> 'null' then
          if jsonb_typeof(v_val) <> 'string' then
            raise exception 'Dòng %: trường "%" phải là chuỗi', v_n, v_k;
          end if;
          v_txt := nullif(btrim(v_val #>> '{}'), '');
        end if;
        v_limit := case v_k
          when 'full_name' then 200
          when 'team' then 200
          when 'email' then 254
          when 'facebook_url' then 500
          else 100
        end;
        if char_length(v_txt) > v_limit then
          raise exception 'Dòng %: trường "%" tối đa % ký tự', v_n, v_k, v_limit;
        end if;
        if v_k = 'email' then
          v_txt := lower(v_txt);
          if v_txt is not null and v_txt !~ c_email_re then
            raise exception 'Dòng %: email không hợp lệ', v_n;
          end if;
        end if;
        if v_k = 'facebook_url' and v_txt is not null and v_txt !~ c_fb_re then
          raise exception 'Dòng %: link Facebook không hợp lệ', v_n;
        end if;
        v_f := v_f || jsonb_build_object(v_k, v_txt);
      end loop;

      v_name := v_f ->> 'full_name';
      v_code := v_f ->> 'student_code';
      v_email := v_f ->> 'email';
      v_class := v_f ->> 'class_name';
      v_phone := v_f ->> 'phone';
      v_fb := v_f ->> 'facebook_url';
      v_title := v_f ->> 'title';
      v_team_name := v_f ->> 'team';

      if v_name is null then
        raise exception 'Dòng %: thiếu họ tên', v_n;
      end if;

      -- ---- Trùng trong chính file ----
      if v_code is not null then
        v_prev := (v_seen_code ->> v_code)::int;
        if v_prev is not null then
          raise exception 'Dòng % trùng với dòng % (MSSV %)', v_n, v_prev, v_code;
        end if;
        v_seen_code := v_seen_code || jsonb_build_object(v_code, v_n);
      end if;
      if v_email is not null then
        v_prev := (v_seen_email ->> v_email)::int;
        if v_prev is not null then
          raise exception 'Dòng % trùng với dòng % (email %)', v_n, v_prev, v_email;
        end if;
        v_seen_email := v_seen_email || jsonb_build_object(v_email, v_n);
      end if;

      -- ---- Ban ----
      v_team_id := null;
      if v_team_name is not null then
        v_team_id := (v_team_cache ->> lower(v_team_name))::uuid;
        if v_team_id is null then
          select t.id into v_team_id
          from public.teams t
          where t.club_id = p_club_id and lower(btrim(t.name)) = lower(v_team_name)
          order by t.created_at, t.id
          limit 1;

          if v_team_id is null then
            raise exception 'Dòng %: ban "%" chưa có trên web. Hãy tạo ban ở mục Quản lí ban hoặc sửa tên trong file.',
              v_n, v_team_name;
          end if;
          v_team_cache := v_team_cache || jsonb_build_object(lower(v_team_name), v_team_id);
        end if;
      end if;

      -- ---- Ghép với thành viên đã có: MSSV trước, rồi email ----
      v_code_id := null;
      v_email_id := null;
      if v_code is not null then
        select m.id into v_code_id
        from public.club_members m
        where m.club_id = p_club_id and m.student_code = v_code;
      end if;
      if v_email is not null then
        select m.id into v_email_id
        from public.club_members m
        where m.club_id = p_club_id and lower(m.email) = v_email;
      end if;

      if v_code_id is not null and v_email_id is not null and v_code_id <> v_email_id then
        raise exception 'Dòng %: MSSV và email thuộc hai thành viên khác nhau trên web', v_n;
      end if;

      if coalesce(v_code_id, v_email_id) is null then
        -- Thêm mới
        insert into public.club_members (
          club_id, team_id, role, is_active, student_code, full_name, class_name,
          email, phone, facebook_url, title
        )
        values (
          p_club_id, v_team_id, 'member', true, v_code, v_name, v_class,
          v_email, v_phone, v_fb, v_title
        );
        v_inserted := v_inserted + 1;
        continue;
      end if;

      -- Cập nhật: chỉ ghi các trường file có giá trị. Không đụng role,
      -- permissions, is_head, user_id, is_active.
      select * into v_m from public.club_members m where m.id = coalesce(v_code_id, v_email_id);

      v_new_email := coalesce(v_email, v_m.email);
      if v_email is not null and lower(v_m.email) = v_email then
        v_new_email := v_m.email;  -- chỉ khác hoa/thường: coi như không đổi
      end if;

      -- Ban của Ban chủ nhiệm/Ban chủ chốt: chỉ Chủ nhiệm được đổi.
      v_new_team := coalesce(v_team_id, v_m.team_id);
      v_staff := v_m.role in ('owner', 'admin');
      if v_staff and not v_is_head and v_new_team is distinct from v_m.team_id then
        v_new_team := v_m.team_id;
        v_staff_skipped := v_staff_skipped + 1;
      end if;

      if (v_name, coalesce(v_code, v_m.student_code), coalesce(v_class, v_m.class_name), v_new_email,
          coalesce(v_phone, v_m.phone), coalesce(v_fb, v_m.facebook_url), coalesce(v_title, v_m.title), v_new_team)
         is not distinct from
         (v_m.full_name, v_m.student_code, v_m.class_name, v_m.email,
          v_m.phone, v_m.facebook_url, v_m.title, v_m.team_id) then
        v_unchanged := v_unchanged + 1;
        continue;
      end if;

      update public.club_members m
      set full_name = v_name,
          student_code = coalesce(v_code, m.student_code),
          class_name = coalesce(v_class, m.class_name),
          email = v_new_email,
          phone = coalesce(v_phone, m.phone),
          facebook_url = coalesce(v_fb, m.facebook_url),
          title = coalesce(v_title, m.title),
          team_id = v_new_team
      where m.id = v_m.id;
      v_updated := v_updated + 1;
    end loop;
  exception
    when others then
      -- Một khối bắt lỗi cho cả vòng lặp (không savepoint mỗi dòng). Lỗi đã có
      -- số dòng thì giữ nguyên; lỗi từ DB/trigger thì thêm tiền tố "Dòng N: ".
      if v_cur is null or sqlerrm like 'Dòng %' then
        raise;
      end if;
      raise exception 'Dòng %: %', v_cur, sqlerrm;
  end;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'staff_team_skipped', v_staff_skipped
  );
end;
$$;

revoke all on function public.import_members(uuid, jsonb) from public, anon;
grant execute on function public.import_members(uuid, jsonb) to authenticated, service_role;

commit;
