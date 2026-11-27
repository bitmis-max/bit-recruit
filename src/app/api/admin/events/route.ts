import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getClubAdminContext } from "../../../../lib/admin/api";
import { friendlyError } from "../../../../lib/ui/friendly-error";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const eventFields = "id,club_id,title,description,image_url,sort_order,created_at";

// Ghi log phía server (chỉ mã/tên lỗi, không ghi dữ liệu người dùng) rồi trả câu tiếng Việt cho client.
function fail(scope: string, error: { code?: string; message?: string }, fallback: string, status: number) {
  console.error(`[api/admin/events] ${scope}: ${error.code ?? ""} ${error.message ?? ""}`);
  return NextResponse.json({ error: friendlyError(error, fallback) }, { status });
}

function parseEventFields(body: Record<string, unknown>) {
  const title = text(body.title);
  const description = text(body.description) || null;
  const imageUrlText = text(body.image_url);
  let imageUrl: string | null = null;
  if (imageUrlText) {
    try {
      const parsed = new URL(imageUrlText);
      if (parsed.protocol !== "https:") throw new Error();
      imageUrl = parsed.toString();
    } catch {
      return { error: "Đường dẫn ảnh phải là URL HTTPS." } as const;
    }
  }
  if (!title) return { error: "Vui lòng nhập tên sự kiện." } as const;
  if (title.length > 200) return { error: "Tên sự kiện không được vượt quá 200 ký tự." } as const;
  return { data: { title, description, image_url: imageUrl } } as const;
}

export async function GET(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const context = await getClubAdminContext(clubId, { permission: "events" });
  if (context.error) return context.error;
  const { data, error } = await context.admin.from("events").select(eventFields)
    .eq("club_id", clubId).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (error) return fail("GET", error, "Không tải được danh sách sự kiện.", 500);
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  const clubId = text(body.clubId);
  const context = await getClubAdminContext(clubId, { permission: "events" });
  if (context.error) return context.error;
  const parsed = parseEventFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const eventId = text(body.id);
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    return NextResponse.json({ error: "Mã sự kiện không hợp lệ." }, { status: 400 });
  }
  const { data: lastEvent, error: orderError } = await context.admin.from("events")
    .select("sort_order").eq("club_id", clubId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (orderError) return fail("POST order", orderError, "Không thêm được sự kiện. Vui lòng thử lại.", 500);
  const { data, error } = await context.admin.from("events")
    .insert({ ...(eventId ? { id: eventId } : {}), club_id: clubId, sort_order: (lastEvent?.sort_order ?? -1) + 1, ...parsed.data }).select(eventFields).single();
  if (error) return fail("POST", error, "Không thêm được sự kiện. Vui lòng thử lại.", 400);
  revalidatePath("/events");
  return NextResponse.json({ event: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  const clubId = text(body.clubId);
  const eventId = text(body.id);
  const orderedEventIds = body.orderedEventIds;
  const context = await getClubAdminContext(clubId, { permission: "events" });
  if (context.error) return context.error;
  if (Array.isArray(orderedEventIds)) {
    const isValidId = (id: unknown): id is string => typeof id === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!orderedEventIds.every(isValidId) || new Set(orderedEventIds).size !== orderedEventIds.length) {
      return NextResponse.json({ error: "Thứ tự sự kiện không hợp lệ." }, { status: 400 });
    }
    const { data: currentEvents, error: currentError } = await context.admin.from("events")
      .select("id").eq("club_id", clubId);
    if (currentError) return fail("PATCH list", currentError, "Không đọc được danh sách sự kiện.", 500);
    const currentIds = new Set((currentEvents ?? []).map((event) => event.id));
    if (orderedEventIds.length !== currentIds.size || orderedEventIds.some((id) => !currentIds.has(id))) {
      return NextResponse.json({ error: "Danh sách sự kiện đã thay đổi. Hãy tải lại trang." }, { status: 409 });
    }
    for (const [sortOrder, id] of orderedEventIds.entries()) {
      const { error } = await context.admin.from("events").update({ sort_order: sortOrder })
        .eq("id", id).eq("club_id", clubId);
      if (error) return fail("PATCH reorder", error, "Không lưu được thứ tự sự kiện. Vui lòng thử lại.", 500);
    }
    const { data: reorderedEvents, error: reorderError } = await context.admin.from("events").select(eventFields)
      .eq("club_id", clubId).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (reorderError) return fail("PATCH reload", reorderError, "Đã lưu thứ tự nhưng không đọc lại được danh sách.", 500);
    revalidatePath("/events");
    return NextResponse.json({ events: reorderedEvents ?? [] });
  }
  if (!eventId) return NextResponse.json({ error: "Thiếu sự kiện cần cập nhật." }, { status: 400 });
  const parsed = parseEventFields(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await context.admin.from("events").update(parsed.data)
    .eq("id", eventId).eq("club_id", clubId).select(eventFields).maybeSingle();
  if (error) return fail("PATCH", error, "Không lưu được sự kiện. Vui lòng thử lại.", 400);
  if (!data) return NextResponse.json({ error: "Không tìm thấy sự kiện trong CLB này." }, { status: 404 });
  revalidatePath("/events");
  return NextResponse.json({ event: data });
}

export async function DELETE(request: NextRequest) {
  const clubId = request.nextUrl.searchParams.get("clubId") ?? "";
  const eventId = request.nextUrl.searchParams.get("id") ?? "";
  const context = await getClubAdminContext(clubId, { permission: "events" });
  if (context.error) return context.error;
  if (!eventId) return NextResponse.json({ error: "Thiếu sự kiện cần xóa." }, { status: 400 });
  const { data, error } = await context.admin.from("events").delete()
    .eq("id", eventId).eq("club_id", clubId).select("id").maybeSingle();
  if (error) return fail("DELETE", error, "Không xóa được sự kiện. Vui lòng thử lại.", 400);
  if (!data) return NextResponse.json({ error: "Không tìm thấy sự kiện trong CLB này." }, { status: 404 });
  revalidatePath("/events");
  return NextResponse.json({ ok: true });
}
