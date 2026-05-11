"use client";

import { useCallback, useEffect, useMemo } from "react";
import { EditorContent, type Editor, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
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

const toolbarButton =
  "rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

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
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Image,
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

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Nhập URL", previousUrl ?? "");
    if (url === null) {
      return;
    }
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Nhập URL ảnh");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

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
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!canUpdate}
        >
          Bold
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!canUpdate}
        >
          Italic
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={!canUpdate}
        >
          Underline
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={!canUpdate}
        >
          Heading
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!canUpdate}
        >
          List
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          disabled={!canUpdate}
        >
          Align Left
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          disabled={!canUpdate}
        >
          Align Center
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          disabled={!canUpdate}
        >
          Align Right
        </button>
        <button type="button" className={toolbarButton} onClick={addLink}>
          Link
        </button>
        <button type="button" className={toolbarButton} onClick={addImage}>
          Image
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          Clear
        </button>
      </div>
      <EditorContent editor={editor} />
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Preview HTML:</span>
        <span className="font-mono">{value.length} chars</span>
      </div>
    </section>
  );
}
