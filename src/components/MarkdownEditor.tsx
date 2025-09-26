"use client";

import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type MarkdownEditorProps = {
  storageKey?: string;
  initialContent?: string;
  className?: string;
};

export default function MarkdownEditor({ storageKey = "canvas_markdown_v1", initialContent = "", className }: MarkdownEditorProps) {
  const content = useMemo(() => {
    if (typeof window === "undefined") return initialContent;
    try {
      return window.localStorage.getItem(storageKey) ?? initialContent;
    } catch {
      return initialContent;
    }
  }, [initialContent, storageKey]);

  const editor = useEditor({
    immediatelyRender : false,
    extensions: [StarterKit],
    content,
    editorProps: {
      attributes: {
        class:
          "prose max-w-none focus:outline-none h-full min-h-full p-4 md:p-6 text-foreground",
      },
    },
    onUpdate({ editor }) {
      try {
        const html = editor.getHTML();
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, html);
        }
      } catch {}
    },
  });

  useEffect(() => {
    return () => {
      try {
        if (typeof window !== "undefined") {
          const html = editor?.getHTML() ?? "";
          window.localStorage.setItem(storageKey, html);
        }
      } catch {}
    };
  }, [editor, storageKey]);

  return (
    <div className={className}>
      <div className="border rounded-xl bg-card h-full flex flex-col">
        <div className="flex-1 overflow-auto scroll-thin">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}


