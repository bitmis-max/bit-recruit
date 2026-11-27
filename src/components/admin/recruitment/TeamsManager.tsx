"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../../lib/supabase/client";
import { friendlyError } from "../../../lib/ui/friendly-error";
import { useCurrentAdminClub } from "../AdminClubContext";
import { Button } from "../ui/Button";
import { CreatePanel } from "../ui/CreatePanel";
import { EmptyState } from "../ui/EmptyState";
import { Field, inputClass } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";

type Team = { id: string; club_id: string; name: string; description: string | null; image_url: string | null; created_at: string; duties: string[] | null; fit_for: string | null };
const teamImageBucket = "team-images";
const teamColumns = "id,club_id,name,description,image_url,created_at,duties,fit_for";
const maxDuties = 6;
const maxDutyLength = 200;

function teamImageStoragePath(imageUrl: string | null, clubId: string, teamId: string) {
  const marker = `/storage/v1/object/public/${teamImageBucket}/`;
  const markerIndex = imageUrl?.indexOf(marker) ?? -1;
  if (!imageUrl || markerIndex < 0) return null;
  try {
    const path = decodeURIComponent(imageUrl.slice(markerIndex + marker.length).split("?")[0]);
    return path.startsWith(`${clubId}/${teamId}/`) ? path : null;
  } catch {
    return null;
  }
}

export function TeamsManager() {
  const supabase = getSupabaseClient();
  const { id: clubId, role } = useCurrentAdminClub();
  const canWrite = role === "owner" || role === "admin";
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duties, setDuties] = useState("");
  const [fitFor, setFitFor] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTeams = useCallback(async () => {
    if (!supabase) { setError("Chưa cấu hình kết nối Supabase."); setLoading(false); return; }
    if (!clubId) { setError("Tài khoản chưa được gán vào CLB nào."); setLoading(false); return; }
    setLoading(true);
    const { data, error: queryError } = await supabase.from("teams")
      .select(teamColumns).eq("club_id", clubId).order("name");
    if (queryError) {
      setError(friendlyError(queryError, "Không tải được danh sách ban. Vui lòng thử lại."));
    } else {
      const rows = (data ?? []) as Team[];
      setTeams(rows);
      setSelectedId((current) => rows.some((team) => team.id === current) ? current : rows[0]?.id ?? "");
      setError(null);
    }
    setLoading(false);
  }, [supabase, clubId]);

  useEffect(() => { void loadTeams(); }, [loadTeams]);

  useEffect(() => {
    if (!imageFile) { setImagePreviewUrl(null); return; }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  const selected = teams.find((team) => team.id === selectedId) ?? null;
  useEffect(() => {
    setName(selected?.name ?? "");
    setDescription(selected?.description ?? "");
    setDuties((selected?.duties ?? []).join("\n"));
    setFitFor(selected?.fit_for ?? "");
    setImageFile(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- so nội dung duties (chuỗi), không so tham chiếu mảng
  }, [selectedId, selected?.name, selected?.description, selected?.duties?.join("\n"), selected?.fit_for]);

  function startCreate() {
    setSelectedId("");
    setIsCreating(true);
    setName("");
    setDescription("");
    setDuties("");
    setFitFor("");
    setImageFile(null);
    setError(null);
    setNotice(null);
  }

  function cancelCreate() {
    setIsCreating(false);
    setSelectedId(teams[0]?.id ?? "");
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !clubId || !canWrite) return;
    const cleanName = name.trim();
    if (!cleanName) return;
    const cleanDuties = duties.split("\n").map((line) => line.trim()).filter(Boolean);
    if (cleanDuties.length > maxDuties) { setError(`Mục "Việc chính" tối đa ${maxDuties} dòng. Hãy gộp bớt các việc.`); return; }
    if (cleanDuties.some((line) => line.length > maxDutyLength)) { setError(`Mỗi việc chính tối đa ${maxDutyLength} ký tự. Hãy rút gọn dòng quá dài.`); return; }
    const profile = { duties: cleanDuties, fit_for: fitFor.trim() || null };
    if (imageFile && (!imageFile.type.match(/^image\/(jpeg|png|webp)$/) || imageFile.size > 5 * 1024 * 1024)) {
      setError("Ảnh phải có định dạng JPG, PNG hoặc WebP và dung lượng tối đa 5 MB.");
      return;
    }
    setBusy(true); setError(null); setNotice(null);
    const teamId = selected && !isCreating ? selected.id : crypto.randomUUID();
    const oldImageUrl = selected && !isCreating ? selected.image_url : null;
    let imageUrl = oldImageUrl;
    let uploadedPath: string | null = null;
    if (imageFile) {
      const extension = imageFile.type === "image/jpeg" ? "jpg" : imageFile.type === "image/png" ? "png" : "webp";
      uploadedPath = `${clubId}/${teamId}/${crypto.randomUUID()}.${extension}`;
      // Each upload gets a unique path, so long-lived browser/CDN caching is safe.
      const { error: uploadError } = await supabase.storage.from(teamImageBucket).upload(uploadedPath, imageFile, { contentType: imageFile.type, cacheControl: "31536000", upsert: false });
      if (uploadError) { setError(friendlyError(uploadError, "Không tải được ảnh lên. Vui lòng thử lại.")); setBusy(false); return; }
      imageUrl = supabase.storage.from(teamImageBucket).getPublicUrl(uploadedPath).data.publicUrl;
    }
    const result = selected && !isCreating
      ? await supabase.from("teams").update({ name: cleanName, description: description.trim() || null, ...profile, image_url: imageUrl }).eq("id", teamId).eq("club_id", clubId).select(teamColumns).single()
      : await supabase.from("teams").insert({ id: teamId, club_id: clubId, name: cleanName, description: description.trim() || null, ...profile, image_url: imageUrl }).select(teamColumns).single();
    setBusy(false);
    if (result.error) {
      if (uploadedPath) await supabase.storage.from(teamImageBucket).remove([uploadedPath]);
      setError(friendlyError(result.error, "Không lưu được ban. Vui lòng thử lại.")); return;
    }
    const saved = result.data as Team;
    const oldImagePath = teamImageStoragePath(oldImageUrl, clubId, teamId);
    if (oldImagePath && oldImageUrl !== imageUrl) await supabase.storage.from(teamImageBucket).remove([oldImagePath]);
    setTeams((rows) => [...rows.filter((team) => team.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "vi")));
    setSelectedId(saved.id);
    setIsCreating(false);
    setNotice(isCreating ? "Đã tạo ban." : "Đã lưu thay đổi.");
    setImageFile(null);
    window.dispatchEvent(new Event("bit:teams-changed"));
  }

  async function deleteTeam() {
    if (!supabase || !clubId || !selected || !canWrite) return;
    if (!window.confirm(`Xóa ban “${selected.name}”?`)) return;
    setBusy(true); setError(null); setNotice(null);
    // Đếm theo tập ban (gồm cả người có ban này là ban phụ), không chỉ ban chính.
    // Việc chưa đóng (tasks.team_id) cũng chặn xóa: ban bị xóa thì việc mất ban sở hữu.
    const [members, positions, openTasks] = await Promise.all([
      supabase.from("club_member_teams").select("member_id", { count: "exact", head: true }).eq("team_id", selected.id),
      supabase.from("recruitment_positions").select("id", { count: "exact", head: true }).eq("team_id", selected.id),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("team_id", selected.id).eq("status", "open"),
    ]);
    if (members.error || positions.error || openTasks.error) {
      setError(friendlyError(members.error ?? positions.error ?? openTasks.error, "Không kiểm tra được dữ liệu liên quan."));
      setBusy(false);
      return;
    }
    if ((openTasks.count ?? 0) > 0) {
      setError(`Ban còn ${openTasks.count} việc chưa đóng. Hãy đóng hoặc xóa các việc đó ở mục Giao việc trước khi xóa ban.`);
      setBusy(false);
      return;
    }
    if ((members.count ?? 0) > 0 || (positions.count ?? 0) > 0) {
      setError("Ban đang được gán cho thành viên hoặc vị trí tuyển. Hãy chuyển các dữ liệu đó sang ban khác trước khi xóa.");
      setBusy(false);
      return;
    }
    const { error: deleteError } = await supabase.from("teams").delete().eq("id", selected.id).eq("club_id", clubId);
    setBusy(false);
    if (deleteError) { setError(friendlyError(deleteError, "Không xóa được ban. Vui lòng thử lại.")); return; }
    const imagePath = teamImageStoragePath(selected.image_url, clubId, selected.id);
    if (imagePath) await supabase.storage.from(teamImageBucket).remove([imagePath]);
    const rows = teams.filter((team) => team.id !== selected.id);
    setTeams(rows);
    setSelectedId(rows[0]?.id ?? "");
    setNotice("Đã xóa ban.");
    window.dispatchEvent(new Event("bit:teams-changed"));
  }

  const teamForm = <form onSubmit={saveTeam} className="space-y-4">
    <Field label="Tên ban"><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={!canWrite || busy} className={inputClass} data-autofocus /></Field>
    <Field label="Mô tả"><textarea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canWrite || busy} className={inputClass} placeholder="Giới thiệu nhiệm vụ và hoạt động của ban…" /></Field>
    <Field label="Việc chính" hint={`Hiện thành danh sách ngắn trên thẻ ban. Mỗi dòng tối đa ${maxDutyLength} ký tự.`}><textarea rows={4} value={duties} onChange={(event) => setDuties(event.target.value)} disabled={!canWrite || busy} className={inputClass} placeholder="Mỗi dòng một việc, tối đa 6" /></Field>
    <Field label="Hợp với bạn nếu…" hint={`Một câu ngắn, tối đa 300 ký tự (${fitFor.length}/300).`}><textarea rows={2} maxLength={300} value={fitFor} onChange={(event) => setFitFor(event.target.value)} disabled={!canWrite || busy} className={inputClass} placeholder="Ví dụ: Bạn thích kể chuyện bằng chữ, hình ảnh hoặc video." /></Field>
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-800">Ảnh ban</p>
      {imagePreviewUrl || selected?.image_url ? <img src={imagePreviewUrl ?? selected?.image_url ?? ""} alt={`Ảnh ban ${name || selected?.name || ""}`} className="max-h-64 w-full rounded-lg border border-zinc-200 object-cover sm:max-w-lg" /> : <div className="flex min-h-40 w-full items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-sm text-zinc-500 sm:max-w-lg">Ban chưa có ảnh</div>}
      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={!canWrite || busy} onChange={(event) => { setImageFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} className="sr-only" tabIndex={-1} aria-hidden="true" />
      {canWrite && <Button variant="secondary" size="sm" icon="upload" onClick={() => imageInputRef.current?.click()} disabled={busy}>{imageFile || selected?.image_url ? "Thay ảnh" : "Tải ảnh lên"}</Button>}
      <p className="text-xs text-zinc-500">JPG, PNG hoặc WebP, tối đa 5 MB.{imageFile ? ` Ảnh mới: ${imageFile.name}` : ""}</p>
    </div>
    {canWrite && <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
      <Button type="submit" variant="primary" loading={busy}>{busy ? "Đang lưu…" : isCreating ? "Tạo ban" : "Lưu thay đổi"}</Button>
      {isCreating && <Button variant="secondary" onClick={cancelCreate} disabled={busy}>Hủy</Button>}
      {selected && !isCreating && <Button variant="danger" icon="trash" className="sm:ml-auto" onClick={() => void deleteTeam()} disabled={busy}>Xóa ban</Button>}
    </div>}
  </form>;

  return <section className="mx-auto max-w-6xl p-5 sm:p-8">
    <PageHeader title="Ban" description="Tạo và cập nhật thông tin các ban. Nội dung hiển thị ở trang Giới thiệu." actions={canWrite && <Button variant="primary" icon="plus" onClick={() => { if (!isCreating) startCreate(); }} aria-expanded={isCreating}>Thêm ban</Button>} />
    {error && <Notice tone="error">{error}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    <CreatePanel open={isCreating} title="Tạo ban mới" onClose={cancelCreate}>{teamForm}</CreatePanel>
    {loading ? <div role="status" aria-label="Đang tải danh sách ban" className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><div className="h-48 animate-pulse rounded-xl bg-zinc-100" /><div className="h-72 animate-pulse rounded-xl bg-zinc-100" /></div> : (
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Panel title="Các ban trong CLB" padded={false}>
          {teams.length ? <ul className="space-y-0.5 p-2">{teams.map((team) => <li key={team.id}><button type="button" aria-current={selectedId === team.id && !isCreating ? "true" : undefined} onClick={() => { setSelectedId(team.id); setIsCreating(false); setError(null); setNotice(null); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 ${selectedId === team.id && !isCreating ? "bg-emerald-50 text-emerald-900" : "text-zinc-700 hover:bg-zinc-100"}`}>{team.name}</button></li>)}</ul>
            : <EmptyState title="Chưa có ban nào" description="Tạo ban đầu tiên để giới thiệu trên trang CLB." action={canWrite && !isCreating && <Button variant="primary" icon="plus" onClick={startCreate}>Thêm ban</Button>} />}
        </Panel>
        {!isCreating && (selected
          ? <Panel title="Thông tin ban">{teamForm}</Panel>
          : teams.length > 0 && <Panel padded={false}><EmptyState title="Chọn một ban để xem hoặc chỉnh sửa" /></Panel>)}
      </div>
    )}
  </section>;
}
