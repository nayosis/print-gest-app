import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Project } from "../model";
import { displayName } from "../utils/format";

interface MarkdownEditorProps {
  project: Project;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}

export function MarkdownEditor({ project, onSave, onClose }: MarkdownEditorProps) {
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [editorContent, setEditorContent] = useState(project.markdown_content ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(editorContent);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-wrap">
      <div className="editor-header">
        <span className="editor-title">{displayName(project)} — <code>main.md</code></span>
        <div className="editor-tabs">
          <button className={`editor-tab ${editorTab === "edit" ? "active" : ""}`} onClick={() => setEditorTab("edit")}>Éditer</button>
          <button className={`editor-tab ${editorTab === "preview" ? "active" : ""}`} onClick={() => setEditorTab("preview")}>Aperçu</button>
        </div>
        <div className="editor-actions">
          {saveError && <span className="save-error">{saveError}</span>}
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>{saving ? "Sauvegarde…" : "Sauvegarder"}</button>
        </div>
      </div>
      {editorTab === "edit" ? (
        <textarea
          className="editor-textarea"
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          placeholder="Décris ton projet ici (Markdown supporté)…"
          spellCheck={false}
          autoFocus
        />
      ) : (
        <div className="editor-preview">
          {editorContent.trim()
            ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{editorContent}</ReactMarkdown></div>
            : <p className="empty-files">Rien à prévisualiser.</p>}
        </div>
      )}
    </div>
  );
}
