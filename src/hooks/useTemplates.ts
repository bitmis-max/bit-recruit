/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";

export type RecipientRow = Record<string, string> & {
  __id: string;
  __status: "pending" | "sent" | "failed";
};

// Chỉ lưu tiêu đề, nội dung và mẫu. KHÔNG lưu danh sách người nhận (dữ liệu cá nhân) vào trình duyệt.
export type TemplateRecord = {
  id: string;
  name: string;
  subject: string;
  html: string;
};

export type DraftState = {
  subject: string;
  html: string;
};

const THEME_KEY = "mailmerge.theme";
// Khóa cũ (dùng chung mọi CLB, có lưu cả danh sách người nhận). Chỉ còn dùng để chuyển mẫu sang khóa mới rồi xóa.
const LEGACY_TEMPLATES_KEY = "mailmerge.templates";
const LEGACY_SELECTED_KEY = "mailmerge.selectedTemplate";
const LEGACY_DRAFT_KEY = "mailmerge.draft";

const keysFor = (clubId: string) => ({
  templates: `mailmerge.templates.${clubId}`,
  selected: `mailmerge.selectedTemplate.${clubId}`,
  draft: `mailmerge.draft.${clubId}`,
});

const DEFAULT_SUBJECT = "Xin chào {{Name}}";
const DEFAULT_HTML = `<p>Chào {{Name}},</p>
<p>Đây là email gửi tự động qua hệ thống mail merge.</p>`;

// localStorage có thể ném lỗi (chế độ riêng tư, bị chặn, đầy bộ nhớ): luôn bọc try/catch.
function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* không lưu được thì bỏ qua */ }
}
function removeStorage(key: string) {
  try { localStorage.removeItem(key); } catch { /* bỏ qua */ }
}
function readJson<T>(key: string): T | null {
  const text = readStorage(key);
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

/** Bỏ `rows`/`selectedId` khỏi mẫu cũ, chỉ giữ các trường còn dùng. */
function toTemplate(value: Partial<TemplateRecord>): TemplateRecord | null {
  if (typeof value?.id !== "string" || typeof value.name !== "string") return null;
  return { id: value.id, name: value.name, subject: String(value.subject ?? DEFAULT_SUBJECT), html: String(value.html ?? DEFAULT_HTML) };
}

export function useTemplates(clubId: string) {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [loadedClub, setLoadedClub] = useState<string | null>(null);

  // Nạp từ localStorage khi mở hoặc khi đổi CLB
  useEffect(() => {
    if (!clubId) return;
    const keys = keysFor(clubId);

    // Chuyển mẫu khóa cũ (nếu có) sang CLB này, bỏ danh sách người nhận, rồi xóa khóa cũ.
    const legacy = readJson<Partial<TemplateRecord>[]>(LEGACY_TEMPLATES_KEY);
    let storedTemplates = (readJson<Partial<TemplateRecord>[]>(keys.templates) ?? [])
      .map(toTemplate).filter((template): template is TemplateRecord => template !== null);
    if (legacy && !storedTemplates.length) {
      storedTemplates = legacy.map(toTemplate).filter((template): template is TemplateRecord => template !== null);
      writeStorage(keys.templates, JSON.stringify(storedTemplates));
    }
    removeStorage(LEGACY_TEMPLATES_KEY);
    removeStorage(LEGACY_SELECTED_KEY);
    removeStorage(LEGACY_DRAFT_KEY);
    setTemplates(storedTemplates);

    const storedSelected = readStorage(keys.selected);
    const matchedTemplate = storedSelected
      ? storedTemplates.find((template) => template.id === storedSelected)
      : null;

    if (matchedTemplate) {
      setSelectedTemplate(matchedTemplate.id);
      setSubject(matchedTemplate.subject);
      setHtml(matchedTemplate.html);
    } else {
      setSelectedTemplate(null);
      const draft = readJson<Partial<DraftState>>(keys.draft);
      setSubject(draft?.subject ?? DEFAULT_SUBJECT);
      setHtml(draft?.html ?? DEFAULT_HTML);
    }
    // Danh sách người nhận không lưu, nên đổi CLB thì bỏ danh sách đang có.
    setRows([]);
    setSelectedId(null);
    setLoadedClub(clubId);

    if (readStorage(THEME_KEY) === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, [clubId]);

  const ready = Boolean(clubId) && loadedClub === clubId;

  // Save theme
  useEffect(() => {
    writeStorage(THEME_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Save draft (chỉ tiêu đề + nội dung)
  useEffect(() => {
    if (!ready) return;
    const draft: DraftState = { subject, html };
    writeStorage(keysFor(clubId).draft, JSON.stringify(draft));
  }, [ready, clubId, html, subject]);

  // Save selected template ID
  useEffect(() => {
    if (!ready) return;
    const key = keysFor(clubId).selected;
    if (!selectedTemplate) removeStorage(key);
    else writeStorage(key, selectedTemplate);
  }, [ready, clubId, selectedTemplate]);

  // Sync templates changes
  useEffect(() => {
    if (!ready || !selectedTemplate) return;

    setTemplates((prev) => {
      const index = prev.findIndex(
        (template) => template.id === selectedTemplate
      );
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = { ...prev[index], subject, html };
      writeStorage(keysFor(clubId).templates, JSON.stringify(next));
      return next;
    });
  }, [ready, clubId, html, selectedTemplate, subject]);

  const handleCreateTemplate = useCallback(() => {
    const name = window.prompt("Tên template?");
    if (!name) return;
    const next = [{ id: crypto.randomUUID(), name, subject, html }, ...templates];
    setTemplates(next);
    writeStorage(keysFor(clubId).templates, JSON.stringify(next));
    setSelectedTemplate(next[0]?.id ?? null);
  }, [clubId, html, subject, templates]);

  const handleDeleteTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    const confirmed = window.confirm("Xóa template này?");
    if (!confirmed) return;
    const next = templates.filter((template) => template.id !== selectedTemplate);
    setTemplates(next);
    writeStorage(keysFor(clubId).templates, JSON.stringify(next));
    setSelectedTemplate(null);
  }, [clubId, selectedTemplate, templates]);

  const handleTemplateSelect = useCallback(
    (value: string) => {
      setSelectedTemplate(value || null);
      const selected = templates.find((template) => template.id === value);
      if (selected) {
        setSubject(selected.subject);
        setHtml(selected.html);
      }
    },
    [templates]
  );

  return {
    subject,
    setSubject,
    html,
    setHtml,
    rows,
    setRows,
    selectedId,
    setSelectedId,
    templates,
    selectedTemplate,
    theme,
    setTheme,
    handleCreateTemplate,
    handleDeleteTemplate,
    handleTemplateSelect,
  };
}
