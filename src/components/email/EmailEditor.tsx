"use client";

import { useEffect, useMemo } from "react";
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
          "editor-content min-h-[280px] rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-900 shadow-sm outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100",
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

  const getButtonClass = (isActive: boolean) =>
    `rounded-lg border p-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${isActive
      ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-200"
      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
    }`;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={getButtonClass(editor?.isActive("bold") ?? false)}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!canUpdate}
          title="In đậm"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h9a4 4 0 004-4 4 4 0 00-4-4H7v16h9a4 4 0 004-4 4 4 0 00-4-4H6z" />
          </svg>
        </button>
        <button
          type="button"
          className={getButtonClass(editor?.isActive("italic") ?? false)}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!canUpdate}
          title="In nghiêng"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <line x1="19" y1="4" x2="10" y2="4" strokeLinecap="round" />
            <line x1="14" y1="20" x2="5" y2="20" strokeLinecap="round" />
            <line x1="15" y1="4" x2="9" y2="20" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className={getButtonClass(editor?.isActive("underline") ?? false)}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={!canUpdate}
          title="Gạch chân"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4v6a6 6 0 0012 0V4M4 20h16" />
          </svg>
        </button>
        <button
          type="button"
          className={getButtonClass(editor?.isActive("heading", { level: 2 }) ?? false)}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={!canUpdate}
          title="Tiêu đề (H2)"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M4 4v16M20 4v16" />
          </svg>
        </button>
        <button
          type="button"
          className={getButtonClass(editor?.isActive("bulletList") ?? false)}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!canUpdate}
          title="Danh sách dấu đầu dòng"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
            <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
            <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
            <line x1="3" y1="6" x2="3.01" y2="6" strokeLinecap="round" />
            <line x1="3" y1="12" x2="3.01" y2="12" strokeLinecap="round" />
            <line x1="3" y1="18" x2="3.01" y2="18" strokeLinecap="round" />
          </svg>
        </button>

        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

        <button
          type="button"
          className={getButtonClass(editor?.isActive({ textAlign: "left" }) ?? false)}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          disabled={!canUpdate}
          title="Căn lề trái"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <line x1="17" y1="10" x2="3" y2="10" strokeLinecap="round" />
            <line x1="21" y1="6" x2="3" y2="6" strokeLinecap="round" />
            <line x1="21" y1="14" x2="3" y2="14" strokeLinecap="round" />
            <line x1="17" y1="18" x2="3" y2="18" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className={getButtonClass(editor?.isActive({ textAlign: "center" }) ?? false)}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          disabled={!canUpdate}
          title="Căn lề giữa"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <line x1="18" y1="10" x2="6" y2="10" strokeLinecap="round" />
            <line x1="21" y1="6" x2="3" y2="6" strokeLinecap="round" />
            <line x1="21" y1="14" x2="3" y2="14" strokeLinecap="round" />
            <line x1="18" y1="18" x2="6" y2="18" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className={getButtonClass(editor?.isActive({ textAlign: "right" }) ?? false)}
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          disabled={!canUpdate}
          title="Căn lề phải"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <line x1="21" y1="10" x2="7" y2="10" strokeLinecap="round" />
            <line x1="21" y1="6" x2="3" y2="6" strokeLinecap="round" />
            <line x1="21" y1="14" x2="3" y2="14" strokeLinecap="round" />
            <line x1="21" y1="18" x2="7" y2="18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <EditorContent editor={editor} />
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Kích thước:</span>
        <span className="font-mono">{value.length} ký tự</span>
      </div>
    </section>
  );
}
