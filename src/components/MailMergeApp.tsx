"use client";

import { useCallback, useMemo, useState } from "react";
import { EmailEditor } from "./email/EmailEditor";
import { VariableSidebar } from "./email/VariableSidebar";
import { ConnectGoogleMailButton, type GmailMessage } from "./email/ConnectGoogleMailButton";
import { ImageImport, ImportPanel } from "./data/ImportPanel";
import { RecipientsTable } from "./data/RecipientsTable";
import { SendControls } from "./campaign/SendControls";
import { PreviewPanel } from "./campaign/PreviewPanel";
import { interpolateTemplate, type EmailImageAsset } from "../lib/email/template";
import type { ParsedData } from "../lib/files/parse";

import { useAuth } from "../hooks/useAuth";
import { useTemplates } from "../hooks/useTemplates";
import { useSender } from "../hooks/useSender";

import { SetupGuide } from "./auth/SetupGuide";
import { useCurrentAdminClub } from "./admin/AdminClubContext";
import { Button } from "./admin/ui/Button";
import { Field, inputClass } from "./admin/ui/Field";
import { Notice } from "./admin/ui/Notice";
import { PageHeader } from "./admin/ui/PageHeader";
import { Panel } from "./admin/ui/Panel";

const selectClass = "h-[30px] w-full rounded-lg border border-zinc-300 bg-white px-2 text-[13px] text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 sm:w-44";

export function MailMergeApp() {
  const {
    session,
    supabaseConfigured,
    lastError: authError,
  } = useAuth();
  const { id: clubId } = useCurrentAdminClub();

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
  } = useTemplates(clubId);

  const [gmailMessage, setGmailMessage] = useState<GmailMessage | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedImage, setImportedImage] = useState<EmailImageAsset | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [insertVariable, setInsertVariable] = useState<
    (variable: string) => void
  >(() => () => undefined);

  const {
    sending,
    progress,
    sendingError,
    canSendBulk,
    handleSend,
    handleSendSelf,
  } = useSender({
    session,
    supabaseConfigured,
    clubId,
    rows,
    setRows,
    subject,
    html,
    importedImage,
    variableValues,
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
    const overrides = Object.fromEntries(Object.entries(variableValues).filter(([, value]) => value !== ""));
    return interpolateTemplate(html, { ...selectedRecipient, ...overrides });
  }, [html, selectedRecipient, variableValues]);

  const previewSubject = useMemo(() => {
    if (!selectedRecipient) return subject;
    const overrides = Object.fromEntries(Object.entries(variableValues).filter(([, value]) => value !== ""));
    return interpolateTemplate(subject, { ...selectedRecipient, ...overrides });
  }, [subject, selectedRecipient, variableValues]);

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
    <div>
      <PageHeader
        title="Gửi mail"
        description="Chọn người nhận, soạn thư, xem trước rồi gửi."
        actions={<ConnectGoogleMailButton onMessage={setGmailMessage} />}
      />
      {gmailMessage && <Notice tone={gmailMessage.tone}>{gmailMessage.text}</Notice>}

      <div className="space-y-5">
        <Panel
          title="1. Người nhận"
          padded={false}
          actions={rows.length ? <span className="text-xs text-zinc-500">{rows.length} người</span> : null}
        >
          <ImportPanel onDataParsed={handleDataParsed} clubId={clubId} externalError={importError} />
          {rows.length > 0 && <RecipientsTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} />}
        </Panel>

        <Panel
          title="2. Soạn thư"
          actions={
            <>
              <select
                aria-label="Chọn template"
                className={selectClass}
                value={selectedTemplate ?? ""}
                onChange={(event) => handleTemplateSelect(event.target.value)}
              >
                <option value="">Chọn template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
              <Button variant="secondary" size="sm" icon="plus" onClick={handleCreateTemplate}>Thêm template</Button>
              <Button variant="danger" size="sm" icon="trash" onClick={handleDeleteTemplate} disabled={!selectedTemplate}>Xóa template</Button>
            </>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              <Field label="Tiêu đề email">
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ví dụ: Thư mời tham dự sự kiện {{Name}}"
                  className={inputClass}
                />
              </Field>
              <div>
                <p className="mb-1 text-sm font-medium text-zinc-800">Nội dung thư</p>
                <EmailEditor value={html} onChange={setHtml} onInsertVariableReady={handleInsertVariableReady} />
              </div>
              <ImageImport onImageParsed={handleImageParsed} />
            </div>
            <div className="min-w-0 border-t border-zinc-100 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <VariableSidebar variables={variables} dataValues={selectedRecipient ?? {}} values={variableValues} onValuesChange={setVariableValues} onInsert={insertVariable} />
            </div>
          </div>
        </Panel>

        <PreviewPanel
          html={previewHtml}
          subject={previewSubject}
          recipient={selectedRecipient}
          importedImage={importedImage}
        />

        <SendControls
          rows={rows}
          subject={subject}
          html={html}
          canSendBulk={canSendBulk}
          progress={progress}
          sending={sending}
          errorMessage={lastError}
          onSendBulk={(targets) => void handleSend(targets)}
          onSendSelf={() => handleSendSelf(selectedRecipient)}
        />
      </div>
    </div>
  );
}
