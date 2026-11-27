"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Extension } from "@tiptap/core";
import { Plugin, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as ProseMirrorNode } from "prosemirror-model";

const VariableHighlight = Extension.create({
  name: "variableHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state: EditorState) {
            const decorations: Decoration[] = [];
            const regex = /{{\s*[\w.-]+\s*}}/g;
            state.doc.descendants((node: ProseMirrorNode, pos: number) => {
              if (!node.isText) {
                return;
              }
              const text = node.text ?? "";
              let match: RegExpExecArray | null = null;
              const nodeRegex = new RegExp(regex);
              while ((match = nodeRegex.exec(text)) !== null) {
                const from = pos + match.index;
                const to = from + match[0].length;
                decorations.push(
                  Decoration.inline(from, to, { class: "var-token" })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

type Tool = { label: string; stroke?: number; icon: ReactNode; active: (editor: Editor) => boolean; run: (editor: Editor) => void };
const line = (x1: number, y1: number, x2: number, y2: number) => <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
const alignTool = (label: string, align: "left" | "center" | "right", rows: [number, number, number][]): Tool => ({
  label,
  icon: <>{rows.map(([x1, x2, y]) => line(x1, y, x2, y))}</>,
  active: (editor) => editor.isActive({ textAlign: align }),
  run: (editor) => editor.chain().focus().setTextAlign(align).run(),
});
const toolGroups: { name: string; tools: Tool[] }[] = [
  {
    name: "format",
    tools: [
      { label: "In đậm", stroke: 2.5, icon: <path d="M6 12h9a4 4 0 004-4 4 4 0 00-4-4H7v16h9a4 4 0 004-4 4 4 0 00-4-4H6z" />, active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
      { label: "In nghiêng", stroke: 2.5, icon: <>{line(19, 4, 10, 4)}{line(14, 20, 5, 20)}{line(15, 4, 9, 20)}</>, active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
      { label: "Gạch chân", stroke: 2.5, icon: <path d="M6 4v6a6 6 0 0012 0V4M4 20h16" />, active: (e) => e.isActive("underline"), run: (e) => e.chain().focus().toggleUnderline().run() },
      { label: "Tiêu đề (H2)", stroke: 2.5, icon: <path d="M4 12h16M4 4v16M20 4v16" />, active: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
      { label: "Danh sách dấu đầu dòng", stroke: 2.5, icon: <>{line(8, 6, 21, 6)}{line(8, 12, 21, 12)}{line(8, 18, 21, 18)}{line(3, 6, 3.01, 6)}{line(3, 12, 3.01, 12)}{line(3, 18, 3.01, 18)}</>, active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
    ],
  },
  {
    name: "align",
    tools: [
      alignTool("Căn lề trái", "left", [[3, 17, 10], [3, 21, 6], [3, 21, 14], [3, 17, 18]]),
      alignTool("Căn lề giữa", "center", [[6, 18, 10], [3, 21, 6], [3, 21, 14], [6, 18, 18]]),
      alignTool("Căn lề phải", "right", [[7, 21, 10], [3, 21, 6], [3, 21, 14], [7, 21, 18]]),
    ],
  },
];

export type EmailEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onInsertVariableReady?: (insert: (text: string) => void) => void;
};

export function EmailEditor({
  value,
  onChange,
  onInsertVariableReady,
}: EmailEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: "Soạn nội dung email tại đây...",
      }),
      VariableHighlight,
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "editor-content min-h-[280px] rounded-lg border border-zinc-300 bg-white p-4 text-sm text-zinc-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Nội dung thư",
      },
    },
    onUpdate({ editor: current }: { editor: Editor }) {
      onChange(current.getHTML());
    },
  });

  const canUpdate = useMemo(() => Boolean(editor), [editor]);

  useEffect(() => {
    if (!editor || !onInsertVariableReady) return;
    onInsertVariableReady((text) =>
      editor.chain().focus().insertContent(text).run()
    );
  }, [editor, onInsertVariableReady]);

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  return (
    <section className="flex flex-col gap-3">
      <div role="toolbar" aria-label="Định dạng thư" className="flex flex-wrap items-center gap-1">
        {toolGroups.map((group, index) => (
          <div key={group.name} className="flex flex-wrap items-center gap-1">
            {index > 0 && <div className="mx-1 h-6 w-px bg-zinc-200" aria-hidden="true" />}
            {group.tools.map((tool) => {
              const active = editor ? tool.active(editor) : false;
              return (
                <button
                  key={tool.label}
                  type="button"
                  aria-label={tool.label}
                  aria-pressed={active}
                  title={tool.label}
                  disabled={!canUpdate}
                  onClick={() => editor && tool.run(editor)}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 ${active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={tool.stroke ?? 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{tool.icon}</svg>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <EditorContent editor={editor} />
      <p className="text-xs text-zinc-500">Kích thước: <span className="tabular-nums">{value.length} ký tự</span></p>
    </section>
  );
}
