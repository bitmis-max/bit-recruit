import { NextRequest, NextResponse } from "next/server";
import { getClubAdminContext } from "../../../../../lib/admin/api";

const eventImageBucket = "event-images";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });

  const clubId = text(form.get("clubId"));
  const eventId = text(form.get("eventId"));
  const file = form.get("file");
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  if (!uuidPattern.test(eventId)) return NextResponse.json({ error: "Mã sự kiện không hợp lệ." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Chưa chọn ảnh." }, { status: 400 });
  if (!(file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) {
    return NextResponse.json({ error: "Ảnh phải có định dạng JPG, PNG hoặc WebP." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Dung lượng ảnh tối đa 5 MB." }, { status: 400 });

  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${clubId}/${eventId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await context.admin.storage.from(eventImageBucket).upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const imageUrl = context.admin.storage.from(eventImageBucket).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ imageUrl });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  const clubId = text(body.clubId);
  const imageUrl = text(body.imageUrl);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;

  let path: string;
  try {
    const parsedUrl = new URL(imageUrl);
    const marker = `/storage/v1/object/public/${eventImageBucket}/`;
    const markerIndex = parsedUrl.pathname.indexOf(marker);
    if (markerIndex < 0) return NextResponse.json({ error: "Ảnh không thuộc kho ảnh sự kiện." }, { status: 400 });
    path = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length));
  } catch {
    return NextResponse.json({ error: "Đường dẫn ảnh không hợp lệ." }, { status: 400 });
  }
  if (!path.startsWith(`${clubId}/`)) return NextResponse.json({ error: "Ảnh không thuộc CLB đang chọn." }, { status: 403 });

  const { error } = await context.admin.storage.from(eventImageBucket).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
