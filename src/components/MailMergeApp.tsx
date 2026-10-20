"use client";

import { useCallback, useMemo, useState } from "react";
import { EmailEditor } from "./email/EmailEditor";
import { VariableSidebar } from "./email/VariableSidebar";
import { ImportPanel } from "./data/ImportPanel";
import { RecipientsTable } from "./data/RecipientsTable";
import { SendControls } from "./campaign/SendControls";
import { PreviewPanel } from "./campaign/PreviewPanel";
import { interpolateTemplate, type EmailImageAsset } from "../lib/email/template";
import type { ParsedData } from "../lib/files/parse";

import { useAuth } from "../hooks/useAuth";
import { useTemplates } from "../hooks/useTemplates";
import { useSender } from "../hooks/useSender";

import { SetupGuide } from "./auth/SetupGuide";
import { getSupabaseClient } from "../lib/supabase/client";

export function MailMergeApp() {
  const {
    session,
    supabaseConfigured,
    lastError: authError,
    handleLogout,
  } = useAuth();

  const {
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
    handleCreateTemplate,
    handleDeleteTemplate,
    handleTemplateSelect,
  } = useTemplates();

  const [importError, setImportError] = useState<string | null>(null);
  const [importedImage, setImportedImage] = useState<EmailImageAsset | null>(null);
  const [insertVariable, setInsertVariable] = useState<
    (variable: string) => void
  >(() => () => undefined);

  const {
    sending,
    progress,
    sendingError,
    canSendBulk,
    handleSendBulk,
    handleSendSelf,
  } = useSender({
    session,
    supabaseConfigured,
    rows,
    setRows,
    subject,
    html,
    importedImage,
  });

  const lastError = authError || sendingError;

  const handleInsertVariableReady = useCallback(
    (insert: (text: string) => void) => {
      setInsertVariable(() => (variable: string) =>
        insert(`{{${variable}}}`)
      );
    },
    []
  );

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
  }, [setRows, setSelectedId]);

  const handleImageParsed = useCallback((image: EmailImageAsset) => {
    setImportedImage(image);
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

  const variables = useMemo(() => {
    const sample = rows[0];
    if (!sample) return [];
    return Object.keys(sample).filter((key) => !key.startsWith("__"));
  }, [rows]);

  if (!supabaseConfigured) {
    return <SetupGuide />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-zinc-50 px-6 py-8 text-zinc-900 dark:bg-black dark:text-zinc-100 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">BIT MAIL</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {session && (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              {session.user.user_metadata?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.user_metadata.avatar_url}
                  alt="Avatar"
                  className="h-6 w-6 rounded-full border border-zinc-200 dark:border-zinc-800"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                  {session.user.email?.[0].toUpperCase()}
                </div>
              )}
              <div className="flex flex-col text-left">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {session.user.user_metadata?.full_name ?? session.user.email}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5">
                  {session.user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-2 rounded-lg bg-zinc-50 border border-zinc-200 px-2 py-1 font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Đăng xuất
              </button>
            </div>
          )}

          <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

          {!session.provider_token && <button type="button" onClick={async () => {
            const supabase = getSupabaseClient();
            const { error } = await supabase?.auth.linkIdentity({ provider: "google", options: {
              scopes: "email profile https://www.googleapis.com/auth/gmail.send",
              redirectTo: `${window.location.origin}/manage-clubs/mail`,
              queryParams: { access_type: "offline", prompt: "consent" },
            } }) ?? { error: new Error("Supabase chưa được cấu hình") };
            if (error) alert(error.message);
          }} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">Kết nối Google để gửi mail</button>}

          <select
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm outline-none transition focus:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
            value={selectedTemplate ?? ""}
            onChange={(event) => handleTemplateSelect(event.target.value)}
          >
            <option value="">Chọn template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreateTemplate}
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200"
          >
            Thêm template
          </button>
          <button
            type="button"
            onClick={handleDeleteTemplate}
            disabled={!selectedTemplate}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            Xóa template
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="flex flex-col gap-6">
          <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex flex-col gap-1 border-b border-zinc-100 pb-4 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Soạn thảo thư
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Nhập tiêu đề, soạn nội dung email HTML, và chèn các biến động. Đính kèm file Excel.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Tiêu đề email
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ví dụ: Thư mời tham dự sự kiện {{Name}}"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:bg-zinc-950"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Nội dung thư
              </label>
              <EmailEditor
                value={html}
                onChange={setHtml}
                onInsertVariableReady={handleInsertVariableReady}
              />
            </div>
          </div>
          <PreviewPanel
            html={previewHtml}
            subject={previewSubject}
            recipient={selectedRecipient}
            importedImage={importedImage}
          />
        </section>

        <section className="flex flex-col gap-6">
          <VariableSidebar variables={variables} onInsert={insertVariable} />
          <ImportPanel
            onDataParsed={handleDataParsed}
            onImageParsed={handleImageParsed}
            externalError={importError}
          />

          <SendControls
            canSendBulk={canSendBulk}
            progress={progress}
            sending={sending}
            errorMessage={lastError}
            onSendBulk={handleSendBulk}
            onSendSelf={() => handleSendSelf(selectedRecipient)}
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
