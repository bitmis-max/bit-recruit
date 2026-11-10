import { NextRequest, NextResponse } from "next/server";
import { getClubAdminContext } from "../../../../lib/admin/api";

const frameBucket = "avatar-frames";
const maxFrameBytes = 2 * 1024 * 1024;
const maxRequestBytes = 2.5 * 1024 * 1024;
const minSide = 400;
const maxSide = 2048;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

// Đọc chiều rộng/cao từ chunk IHDR (ngay sau chữ ký PNG); null nếu không phải PNG hợp lệ.
function readPngSize(bytes: Uint8Array) {
  if (bytes.length < 33) return null;
  for (let i = 0; i < pngSignature.length; i += 1) if (bytes[i] !== pngSignature[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function POST(request: NextRequest) {
  // Kiểm tra quyền TRƯỚC khi đọc thân yêu cầu: clubId bắt buộc nằm trong query `?clubId=`.
  const clubId = text(request.nextUrl.searchParams.get("clubId"));
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return NextResponse.json({ error: "Thiếu kích thước dữ liệu gửi lên." }, { status: 411 });
  if (length > maxRequestBytes) return NextResponse.json({ error: "Dung lượng khung tối đa 2 MB." }, { status: 413 });
  if (!uuidPattern.test(clubId)) return NextResponse.json({ error: "Mã CLB không hợp lệ." }, { status: 400 });

  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  const name = text(form.get("name"));
  const file = form.get("file");
  if (name.length < 1 || name.length > 120) return NextResponse.json({ error: "Tên khung phải dài 1 đến 120 ký tự." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Chưa chọn ảnh khung." }, { status: 400 });
  if (file.size > maxFrameBytes) return NextResponse.json({ error: "Dung lượng khung tối đa 2 MB." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = readPngSize(bytes);
  if (!size) return NextResponse.json({ error: "Khung phải là tệp PNG hợp lệ." }, { status: 400 });
  if (size.width !== size.height) return NextResponse.json({ error: "Khung phải là ảnh vuông (rộng bằng cao)." }, { status: 400 });
  if (size.width < minSide || size.width > maxSide) {
    return NextResponse.json({ error: `Kích thước khung phải từ ${minSide} đến ${maxSide} px mỗi cạnh.` }, { status: 400 });
  }

  const path = `${clubId}/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await context.admin.storage.from(frameBucket).upload(path, bytes, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: "Không tải được khung lên kho ảnh." }, { status: 400 });

  const { data: member } = await context.admin.from("club_members").select("id")
    .eq("club_id", clubId).eq("user_id", context.user.id).maybeSingle();
  const { data: frame, error } = await context.admin.from("avatar_frames")
    .insert({ club_id: clubId, name, image_path: path, created_by: member?.id ?? null })
    .select("id,name,image_path").single();
  if (error || !frame) {
    await context.admin.storage.from(frameBucket).remove([path]);
    return NextResponse.json({ error: "Không lưu được khung. Hãy thử lại." }, { status: 400 });
  }

  const publicUrl = context.admin.storage.from(frameBucket).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ ok: true, data: { id: frame.id, name: frame.name, image_path: frame.image_path, publicUrl } });
}

export async function DELETE(request: NextRequest) {
  const clubId = text(request.nextUrl.searchParams.get("clubId"));
  const id = text(request.nextUrl.searchParams.get("id"));
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  if (!uuidPattern.test(id)) return NextResponse.json({ error: "Mã khung không hợp lệ." }, { status: 400 });

  const { data: frame } = await context.admin.from("avatar_frames").select("id,image_path")
    .eq("id", id).eq("club_id", clubId).maybeSingle();
  if (!frame) return NextResponse.json({ error: "Không tìm thấy khung trong CLB này." }, { status: 404 });

  // Xóa dòng trước (task đang dùng sẽ có frame_id null); ảnh mồ côi còn lại nếu xóa object lỗi vẫn an toàn hơn dòng trỏ vào ảnh đã mất.
  const { error } = await context.admin.from("avatar_frames").delete().eq("id", id).eq("club_id", clubId);
  if (error) return NextResponse.json({ error: "Không xóa được khung. Hãy thử lại." }, { status: 400 });
  if (frame.image_path.startsWith(`${clubId}/`)) {
    await context.admin.storage.from(frameBucket).remove([frame.image_path]);
  }
  return NextResponse.json({ ok: true, data: { id } });
}
