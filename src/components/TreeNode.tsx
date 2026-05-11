import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderNode, Project } from "../model";
import { displayName } from "../utils/format";
import { tagColor } from "../utils/color";

interface TreeNodeProps {
  node: FolderNode;
  depth: number;
  selected: Project | null;
  expanded: Set<string>;
  onSelect: (p: Project) => void;
  onToggle: (path: string) => void;
  onMove: (fromPath: string, name: string) => void;
  onRenamed: (oldPath: string, newPath: string) => void;
  onCreated: () => void;
  onTagClick: (tag: string) => void;
}

export function TreeNode({
  node, depth, selected, expanded,
  onSelect, onToggle, onMove, onRenamed, onCreated, onTagClick,
}: TreeNodeProps) {
  const [creating, setCreating] = useState<"folder" | "project" | null>(null);
  const [createInput, setCreateInput] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const isExpanded = expanded.has(node.path);
  const indent = depth * 14;

  async function handleCreate() {
    const name = createInput.trim();
    if (!name) return;
    try {
      if (creating === "folder") {
        await invoke("create_folder", { parentPath: node.path, name });
      } else {
        await invoke("create_project", { rootPath: node.path, title: name });
      }
      setCreating(null);
      setCreateInput("");
      setCreateError(null);
      onCreated();
    } catch (e) {
      setCreateError(String(e));
    }
  }

  async function handleRename() {
    const name = renameInput.trim();
    if (!name || name === node.name) { setRenaming(false); return; }
    try {
      const newPath = await invoke<string>("rename_folder", { path: node.path, newName: name });
      setRenaming(false);
      setRenameError(null);
      onRenamed(node.path, newPath);
    } catch (e) {
      setRenameError(String(e));
    }
  }

  function startCreating(type: "folder" | "project") {
    setCreating(type);
    setCreateInput("");
    setCreateError(null);
    if (!isExpanded) onToggle(node.path);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Project leaf ───────────────────────────────────────────────────────────
  if (node.project) {
    const p = node.project;
    const isSelected = selected?.path === p.path;
    return (
      <div
        className={`tree-project ${isSelected ? "active" : ""}`}
        style={{ paddingLeft: indent + 6 }}
        onClick={() => onSelect(p)}
      >
        <span className="tree-project-icon">📄</span>
        <span className="tree-project-name">{displayName(p)}</span>
        {p.status === "done" && <span className="badge badge-done">✓</span>}
        {p.tags.length > 0 && (
          <span className="tree-tags">
            {p.tags.map(tag => {
              const { bg, text } = tagColor(tag);
              return (
                <span key={tag} className="sidebar-tag" style={{ background: bg, color: text }}
                  onClick={e => { e.stopPropagation(); onTagClick(tag); }}>
                  {tag}
                </span>
              );
            })}
          </span>
        )}
        <span className="tree-folder-actions">
          <button className="tree-action-btn" title="Déplacer vers…"
            onClick={e => { e.stopPropagation(); onMove(node.path, displayName(p)); }}>
            ↗
          </button>
        </span>
      </div>
    );
  }

  // ── Folder node ────────────────────────────────────────────────────────────
  return (
    <div className="tree-folder-wrap">
      <div className="tree-folder-row" style={{ paddingLeft: indent }}>
        <button className="tree-folder-toggle" onClick={() => !renaming && onToggle(node.path)}>
          <span className="tree-chevron">{isExpanded ? "▾" : "▸"}</span>
          <span className="tree-folder-icon">📁</span>
          {renaming ? (
            <input
              ref={renameRef}
              className="tree-rename-input"
              value={renameInput}
              onChange={e => setRenameInput(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") { setRenaming(false); setRenameError(null); }
              }}
              onBlur={handleRename}
            />
          ) : (
            <span className="tree-folder-name">{node.name}</span>
          )}
        </button>
        {renameError && <span className="tree-rename-error">{renameError}</span>}
        <span className="tree-folder-actions">
          <button className="tree-action-btn" title="Renommer"
            onClick={e => { e.stopPropagation(); setRenaming(true); setRenameInput(node.name); setTimeout(() => renameRef.current?.focus(), 50); }}>✏</button>
          <button className="tree-action-btn" title="Déplacer vers…"
            onClick={() => onMove(node.path, node.name)}>↗</button>
          <button className="tree-action-btn" title="Nouveau dossier"
            onClick={() => startCreating("folder")}>📁+</button>
          <button className="tree-action-btn" title="Nouveau projet"
            onClick={() => startCreating("project")}>📄+</button>
        </span>
      </div>

      {isExpanded && (
        <div className="tree-children">
          {creating && (
            <div className="tree-create-form" style={{ paddingLeft: indent + 14 }}>
              <input
                ref={inputRef}
                className="tree-create-input"
                placeholder={creating === "folder" ? "Nom du dossier…" : "Titre du projet…"}
                value={createInput}
                onChange={e => setCreateInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(null); setCreateInput(""); }
                }}
              />
              <button className="btn-save" onClick={handleCreate}
                disabled={!createInput.trim()}>OK</button>
              <button className="btn-cancel" onClick={() => setCreating(null)}>✕</button>
              {createError && <span className="tree-create-error">{createError}</span>}
            </div>
          )}
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
              onMove={onMove}
              onRenamed={onRenamed}
              onCreated={onCreated}
              onTagClick={onTagClick}
            />
          ))}
          {node.children.length === 0 && !creating && (
            <span className="tree-empty" style={{ paddingLeft: indent + 20 }}>Dossier vide</span>
          )}
        </div>
      )}
    </div>
  );
}
