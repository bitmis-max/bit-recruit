"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmailEditor } from "./email/EmailEditor";
import { VariableSidebar } from "./email/VariableSidebar";
import { ImportPanel } from "./data/ImportPanel";
import { RecipientsTable, type RecipientRow } from "./data/RecipientsTable";
import { SendControls } from "./campaign/SendControls";
import { PreviewPanel } from "./campaign/PreviewPanel";
import { interpolateTemplate } from "../lib/email/template";
import { isValidEmail } from "../lib/email/validators";
import { sendEmail } from "../lib/email/sender";
import type { ParsedData } from "../lib/files/parse";

const DEFAULT_HTML = "<p>Xin chào {{name}},</p><p>Chúng tôi muốn giới thiệu...</p>";
const DEFAULT_SUBJECT = "Xin chào {{name}}";
const RATE_LIMIT_MS = 500;
const MAX_RETRY = 2;

const STORAGE_KEY = "mailmerge.templates";

type TemplateRecord = {
  id: string;
  name: string;
  subject: string;
  html: string;
};

export function MailMergeApp() {
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [testEmail, setTestEmail] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [insertVariable, setInsertVariable] = useState<
    (variable: string) => void
  >(() => () => undefined);
  const [lastError, setLastError] = useState<string | null>(null);

  const handleInsertVariableReady = useCallback(
    (insert: (text: string) => void) => {
      setInsertVariable(() => (variable: string) =>
        insert(`{{${variable}}}`)
      );
    },
    []
  );

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setTemplates(JSON.parse(stored) as TemplateRecord[]);
      } catch {
        setTemplates([]);
      }
    }

    const storedTheme = localStorage.getItem("mailmerge.theme");
    if (storedTheme === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mailmerge.theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const handleDataParsed = useCallback((data: ParsedData, file?: File) => {
    setImportError(null);
    const hasEmail = data.columns.some(
      (column) => column.toLowerCase() === "email"
    );
    if (!hasEmail) {
      setRows([]);
      setSelectedId(null);
      setImportError("File phải có cột 'email' để gửi.");
      return;
    }
    const hydratedRows = data.rows.map((row, index) => ({
      __id: `${index}-${Date.now()}`,
      __status: "pending" as const,
      ...row,
    }));
    setRows(hydratedRows);
    setSelectedId(hydratedRows[0]?.__id ?? null);
    if (file) {
      void file;
    }
  }, []);

  const selectedRecipient = useMemo(
    () => rows.find((row) => row.__id === selectedId) ?? null,
    [rows, selectedId]
  );

  const previewHtml = useMemo(() => {
    if (!selectedRecipient) return html;
    return interpolateTemplate(html, selectedRecipient);
  }, [html, selectedRecipient]);

  const previewSubject = useMemo(() => {
    if (!selectedRecipient) return subject;
    return interpolateTemplate(subject, selectedRecipient);
  }, [subject, selectedRecipient]);

  const canSendTest = useMemo(
    () =>
      Boolean(
        selectedRecipient &&
          isValidEmail(testEmail) &&
          isValidEmail(senderEmail)
      ),
    [selectedRecipient, senderEmail, testEmail]
  );

  const canSendBulk = useMemo(
    () => Boolean(rows.length && isValidEmail(senderEmail)),
    [rows.length, senderEmail]
  );

  const variables = useMemo(() => {
    const sample = rows[0];
    if (!sample) return [];
    return Object.keys(sample).filter((key) => !key.startsWith("__"));
  }, [rows]);

  const handleSend = useCallback(
    async (targets: RecipientRow[]) => {
      if (!targets.length) return;
      setSending(true);
      setProgress(0);
      setLastError(null);

      let completed = 0;
      const updatedRows = [...rows];

      for (const recipient of targets) {
        const index = updatedRows.findIndex((row) => row.__id === recipient.__id);
        if (index === -1) continue;

        const cleanRecipient = Object.fromEntries(
          Object.entries(recipient).filter(([key]) => !key.startsWith("__"))
        ) as Record<string, string>;

        const emailValue = cleanRecipient.email ?? "";
        if (!isValidEmail(emailValue)) {
          updatedRows[index] = { ...updatedRows[index], __status: "failed" };
          completed += 1;
          setProgress(completed / targets.length);
          setRows([...updatedRows]);
          continue;
        }

        let success = false;
        for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
          try {
            await sendEmail({
              to: emailValue,
              from: senderEmail,
              subject: interpolateTemplate(subject, cleanRecipient),
              html: interpolateTemplate(html, cleanRecipient),
              variables: cleanRecipient,
            });
            success = true;
            break;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Send failed";
            setLastError(message);
            // eslint-disable-next-line no-console
            console.error("Send attempt failed", {
              to: emailValue,
              attempt,
              message,
            });
            await new Promise((resolve) =>
              setTimeout(resolve, 400 * (attempt + 1))
            );
          }
        }

        updatedRows[index] = {
          ...updatedRows[index],
          __status: success ? "sent" : "failed",
        };
        completed += 1;
        setProgress(completed / targets.length);
        setRows([...updatedRows]);

        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
      }

      setSending(false);
    },
    [html, rows, senderEmail, subject]
  );

  const handleSendTest = useCallback(() => {
    if (
      !selectedRecipient ||
      !isValidEmail(testEmail) ||
      !isValidEmail(senderEmail)
    ) {
      return;
    }
    void handleSend([
      {
        ...selectedRecipient,
        email: testEmail,
      },
    ]);
  }, [handleSend, selectedRecipient, senderEmail, testEmail]);

  const handleSendBulk = useCallback(() => {
    void handleSend(rows);
  }, [handleSend, rows]);

  const handleSaveTemplate = useCallback(() => {
    const name = window.prompt("Tên template?");
    if (!name) return;
    const next = [
      {
        id: crypto.randomUUID(),
        name,
        subject,
        html,
      },
      ...templates,
    ];
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [html, subject, templates]);

  const handleTemplateSelect = useCallback(
    (value: string) => {
      setSelectedTemplate(value);
      const selected = templates.find((template) => template.id === value);
      if (selected) {
        setSubject(selected.subject);
        setHtml(selected.html);
      }
    },
    [templates]
  );

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-zinc-50 px-6 py-8 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">BIT MAIL</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            value={selectedTemplate ?? ""}
            onChange={(event) => handleTemplateSelect(event.target.value)}
          >
            <option value="">Template đã lưu</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="flex flex-col gap-6">
          <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Soạn email HTML, chèn biến và preview.
                </p>
              </div>
            </div>
            <EmailEditor
              value={html}
              onChange={setHtml}
              onInsertVariableReady={handleInsertVariableReady}
            />
          </div>
          <PreviewPanel html={previewHtml} subject={previewSubject} recipient={selectedRecipient} />
        </section>

        <section className="flex flex-col gap-6">
          <VariableSidebar variables={variables} onInsert={insertVariable} />
          <ImportPanel onDataParsed={handleDataParsed} externalError={importError} />
          <SendControls
            subject={subject}
            onSubjectChange={setSubject}
            senderEmail={senderEmail}
            onSenderEmailChange={setSenderEmail}
            testEmail={testEmail}
            onTestEmailChange={setTestEmail}
            selectedRecipient={selectedRecipient}
            canSendTest={canSendTest}
            canSendBulk={canSendBulk}
            progress={progress}
            sending={sending}
            errorMessage={lastError}
            onSendTest={handleSendTest}
            onSendBulk={handleSendBulk}
            onSaveTemplate={handleSaveTemplate}
          />
          <RecipientsTable
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </section>
      </main>
    </div>
  );
}
