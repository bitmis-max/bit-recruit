/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback } from "react";

export type RecipientRow = Record<string, string> & {
  __id: string;
  __status: "pending" | "sent" | "failed";
};

export type TemplateRecord = {
  id: string;
  name: string;
  subject: string;
  html: string;
  rows?: RecipientRow[];
  selectedId?: string | null;
};

export type DraftState = {
  subject: string;
  html: string;
  rows: RecipientRow[];
  selectedId: string | null;
  theme: "light" | "dark";
};

const STORAGE_KEY = "mailmerge.templates";
const SELECTED_TEMPLATE_KEY = "mailmerge.selectedTemplate";
const DRAFT_KEY = "mailmerge.draft";

const DEFAULT_SUBJECT = "Xin chào {{Name}}";
const DEFAULT_HTML = `<p>Chào {{Name}},</p>
<p>Đây là email gửi tự động qua hệ thống mail merge.</p>`;

export function useTemplates() {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Load from localStorage on mount
  useEffect(() => {
    let storedTemplates: TemplateRecord[] = [];
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        storedTemplates = JSON.parse(stored) as TemplateRecord[];
        setTemplates(storedTemplates);
      } catch {
        setTemplates([]);
      }
    }

    const storedSelected = localStorage.getItem(SELECTED_TEMPLATE_KEY);
    const matchedTemplate = storedSelected
      ? storedTemplates.find((template) => template.id === storedSelected)
      : null;

    if (matchedTemplate) {
      setSelectedTemplate(matchedTemplate.id);
      setSubject(matchedTemplate.subject ?? DEFAULT_SUBJECT);
      setHtml(matchedTemplate.html ?? DEFAULT_HTML);
      setRows(matchedTemplate.rows ?? []);
      setSelectedId(matchedTemplate.selectedId ?? null);
    } else {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft) as DraftState;
          setSubject(parsed.subject ?? DEFAULT_SUBJECT);
          setHtml(parsed.html ?? DEFAULT_HTML);
          setRows(parsed.rows ?? []);
          setSelectedId(parsed.selectedId ?? null);
          setTheme(parsed.theme ?? "light");
        } catch {
          // ignore corrupted drafts
        }
      }
    }

    const storedTheme = localStorage.getItem("mailmerge.theme");
    if (storedTheme === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  // Save theme to localStorage
  useEffect(() => {
    localStorage.setItem("mailmerge.theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Save draft state
  useEffect(() => {
    const draft: DraftState = {
      subject,
      html,
      rows,
      selectedId,
      theme,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [html, rows, selectedId, subject, theme]);

  // Save selected template ID
  useEffect(() => {
    if (!selectedTemplate) {
      localStorage.removeItem(SELECTED_TEMPLATE_KEY);
      return;
    }
    localStorage.setItem(SELECTED_TEMPLATE_KEY, selectedTemplate);
  }, [selectedTemplate]);

  // Sync templates changes
  useEffect(() => {
    if (!selectedTemplate) return;

    setTemplates((prev) => {
      const index = prev.findIndex(
        (template) => template.id === selectedTemplate
      );
      if (index === -1) return prev;
      const updated = {
        ...prev[index],
        subject,
        html,
        rows,
        selectedId,
      };
      const next = [...prev];
      next[index] = updated;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [html, rows, selectedId, selectedTemplate, subject]);

  const handleCreateTemplate = useCallback(() => {
    const name = window.prompt("Tên template?");
    if (!name) return;
    const next = [
      {
        id: crypto.randomUUID(),
        name,
        subject,
        html,
        rows,
        selectedId,
      },
      ...templates,
    ];
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSelectedTemplate(next[0]?.id ?? null);
  }, [html, rows, selectedId, subject, templates]);

  const handleDeleteTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    const confirmed = window.confirm("Xóa template này?");
    if (!confirmed) return;
    const next = templates.filter((template) => template.id !== selectedTemplate);
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSelectedTemplate(null);
  }, [selectedTemplate, templates]);

  const handleTemplateSelect = useCallback(
    (value: string) => {
      setSelectedTemplate(value);
      const selected = templates.find((template) => template.id === value);
      if (selected) {
        setSubject(selected.subject);
        setHtml(selected.html);
        setRows(selected.rows ?? []);
        setSelectedId(selected.selectedId ?? null);
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
