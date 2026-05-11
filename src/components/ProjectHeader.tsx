import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "../model";
import { displayName, toCamelCasePreview } from "../utils/format";
import { tagColor } from "../utils/color";

interface ProjectHeaderProps {
  selected: Project;
  activeTagFilter: string | null;
  onTagFilterChange: (tag: string | null) => void;
  onStatusChange: () => void;
  onRenamed: (updated: Project) => void;
  onTagAdded: (tag: string) => Promise<void>;
  onTagRemoved: (tag: string) => Promise<void>;
}

export function ProjectHeader({
  selected,
  activeTagFilter,
  onTagFilterChange,
  onStatusChange,
  onRenamed,
  onTagAdded,
  onTagRemoved,
}: ProjectHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const handleRename = async () => {
    if (!renameValue.trim()) return;
    setRenameLoading(true);
    setRenameError(null);
    try {
      const updated = await invoke<Project>("rename_project", {
        projectPath: selected.path,
        newTitle: renameValue.trim(),
      });
      onRenamed(updated);
      setRenaming(false);
    } catch (e) {
      setRenameError(String(e));
    } finally {
      setRenameLoading(false);
    }
  };

  const handleAddTag = async () => {
    const tag = tagInput.trim();
    if (!tag || selected.tags.includes(tag)) {
      setAddingTag(false);
      setTagInput("");
      return;
    }
    await onTagAdded(tag);
    setTagInput("");
    setAddingTag(false);
  };

  return (
    <div className="project-header">
      {renaming ? (
        <div className="rename-form">
          <input
            className="rename-input"
            value={renameValue}
            onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
            placeholder="Nom du projet"
            autoFocus
          />
          <div className="rename-hint">
            Dossier : <code>{renameValue.trim() ? toCamelCasePreview(renameValue) : "…"}</code>
          </div>
          {renameError && <p className="rename-error">{renameError}</p>}
          <div className="rename-actions">
            <button className="btn-cancel" onClick={() => setRenaming(false)} disabled={renameLoading}>Annuler</button>
            <button className="btn-save" onClick={handleRename} disabled={renameLoading || !renameValue.trim()}>
              {renameLoading ? "…" : "Renommer"}
            </button>
          </div>
        </div>
      ) : (
        <div className="detail-title-row">
          <div>
            <h1 className="detail-title">{displayName(selected)}</h1>
            <span className="folder-badge">📁 {selected.name}</span>
          </div>
          <div className="detail-title-actions">
            <button
              className={`status-badge ${selected.status === "done" ? "status-done" : "status-draft"}`}
              onClick={onStatusChange}
              title="Cliquer pour changer le statut"
            >
              {selected.status === "done" ? "✓ Terminé" : "✏ Brouillon"}
            </button>
            <button
              className="btn-rename"
              onClick={() => { setRenameValue(displayName(selected)); setRenameError(null); setRenaming(true); }}
            >
              ✏️ Renommer
            </button>
          </div>
        </div>
      )}
      <div className="tags-row">
        {selected.tags.map((tag) => {
          const { bg, text } = tagColor(tag);
          return (
            <span
              key={tag}
              className="tag-chip"
              style={{ background: bg, color: text }}
              onClick={() => onTagFilterChange(activeTagFilter === tag ? null : tag)}
              title="Cliquer pour filtrer"
            >
              {tag}
              <button
                className="tag-remove"
                style={{ color: text }}
                onClick={(e) => { e.stopPropagation(); onTagRemoved(tag); }}
              >
                ×
              </button>
            </span>
          );
        })}
        {addingTag ? (
          <input
            className="tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddTag();
              if (e.key === "Escape") { setAddingTag(false); setTagInput(""); }
            }}
            onBlur={handleAddTag}
            placeholder="Nouveau tag…"
            autoFocus
            maxLength={32}
          />
        ) : (
          <button className="tag-add-btn" onClick={() => setAddingTag(true)}>+ Tag</button>
        )}
      </div>
    </div>
  );
}
