import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClubAdminContext } from "../../../../lib/admin/api";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const eventFields = "id,club_id,title,description,image_url,event_date,created_at";

function parseEventFields(body: Record<string, unknown>) {
  const title = text(body.title);
  const description = text(body.description) || null;
  const imageUrlText = text(body.image_url);
  const dateText = text(body.event_date);
  let imageUrl: string | null = null;
  if (imageUrlText) {
    try {
      const parsed = new URL(imageUrlText);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
      imageUrl = parsed.toString();
    } catch {
      return { error: "Đường dẫn ảnh phải là URL HTTP hoặc HTTPS." } as const;
    }
  }
  let eventDate: string | null = null;
  if (dateText) {
    const parsedDate = new Date(dateText);
    if (Number.isNaN(parsedDate.getTime())) return { error: "Ngày sự kiện không hợp lệ." } as const;
    eventDate = parsedDate.toISOString();
  }
  if (!title) return { error: "Vui lòng nhập tên sự kiện." } as const;
  if (title.length > 200) return { error: "Tên sự kiện không được vượt quá 200 ký tự." } as const;
  return { data: { title, description, image_url: imageUrl, event_date: eventDate } } as const;
}

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const { data, error } = await context.admin.from("events").select(eventFields)
    .eq("club_id", clubId).order("event_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  const clubId = text(body.clubId);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  const parsed = parseEventFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const eventId = text(body.id);
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    return NextResponse.json({ error: "Mã sự kiện không hợp lệ." }, { status: 400 });
  }
  const { data, error } = await context.admin.from("events")
    .insert({ ...(eventId ? { id: eventId } : {}), club_id: clubId, ...parsed.data }).select(eventFields).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  revalidatePath("/events");
  return NextResponse.json({ event: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  const clubId = text(body.clubId);
  const eventId = text(body.id);
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  if (!eventId) return NextResponse.json({ error: "Thiếu sự kiện cần cập nhật." }, { status: 400 });
  const parsed = parseEventFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await context.admin.from("events").update(parsed.data)
    .eq("id", eventId).eq("club_id", clubId).select(eventFields).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy sự kiện trong CLB này." }, { status: 404 });
  revalidatePath("/events");
  return NextResponse.json({ event: data });
}

export async function DELETE(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const eventId = request.nextUrl.searchParams.get("id") ?? "";
  const context = await getClubAdminContext(clubId);
  if (context.error) return context.error;
  if (!eventId) return NextResponse.json({ error: "Thiếu sự kiện cần xóa." }, { status: 400 });
  const { data, error } = await context.admin.from("events").delete()
    .eq("id", eventId).eq("club_id", clubId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy sự kiện trong CLB này." }, { status: 404 });
  revalidatePath("/events");
  return NextResponse.json({ ok: true });
}
