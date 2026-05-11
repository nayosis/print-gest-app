import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { Project, FolderNode } from "../model";
import { displayName, toCamelCasePreview, sortedInsert } from "../utils/format";
import { tagColor } from "../utils/color";
import { TreeNode } from "./TreeNode";

interface SidebarProps {
  rootFolder: string | null;
  folderTree: FolderNode | null;
  projects: Project[];
  selected: Project | null;
  loading: boolean;
  error: string | null;
  showConsumablesView: boolean;
  search: string;
  activeTagFilter: string | null;
  onSelectProject: (p: Project) => void;
  onSelectFolder: () => void;
  onRefresh: (selectPath?: string) => void;
  onShowConsumables: () => void;
  onOpenSettings: () => void;
  onSearchChange: (s: string) => void;
  onClearTagFilter: () => void;
  onTagClick: (tag: string) => void;
  onProjectCreated: (p: Project) => void;
}

interface FolderEntry { name: string; path: string; depth: number; }

function collectFolders(node: FolderNode, exclude: string, depth = 0): FolderEntry[] {
  if (node.project) return [];
  // Exclude the item being moved and its descendants
  if (node.path === exclude || node.path.startsWith(exclude + "\\") || node.path.startsWith(exclude + "/")) return [];
  const result: FolderEntry[] = [{ name: node.name, path: node.path, depth }];
  for (const child of node.children) result.push(...collectFolders(child, exclude, depth + 1));
  return result;
}

export function Sidebar({
  rootFolder, folderTree, projects, selected, loading, error,
  showConsumablesView, search, activeTagFilter,
  onSelectProject, onSelectFolder, onRefresh, onShowConsumables,
  onOpenSettings, onSearchChange, onClearTagFilter, onTagClick,
  onProjectCreated,
}: SidebarProps) {
  const [appVersion, setAppVersion] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rootCreating, setRootCreating] = useState<"folder" | "project" | null>(null);
  const [rootCreateInput, setRootCreateInput] = useState("");
  const [rootCreateError, setRootCreateError] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ path: string; name: string } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const folderName = rootFolder
    ? rootFolder.split(/[\\/]/).filter(Boolean).at(-1)
    : null;

  function toggleExpanded(path: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  async function handleMove(toParentPath: string) {
    if (!moveTarget) return;
    try {
      const newPath = await invoke<string>("move_item", {
        fromPath: moveTarget.path,
        toParentPath,
      });
      setMoveTarget(null);
      setMoveError(null);
      let selectPath: string | undefined;
      if (selected?.path.startsWith(moveTarget.path)) {
        selectPath = newPath + selected.path.slice(moveTarget.path.length);
      }
      onRefresh(selectPath);
    } catch (e) {
      setMoveError(String(e));
    }
  }

  async function handleRootCreate() {
    if (!rootFolder || !rootCreateInput.trim()) return;
    try {
      if (rootCreating === "folder") {
        await invoke("create_folder", { parentPath: rootFolder, name: rootCreateInput.trim() });
        onRefresh();
      } else {
        const p = await invoke<Project>("create_project", { rootPath: rootFolder, title: rootCreateInput.trim() });
        onProjectCreated(p);
      }
      setRootCreating(null);
      setRootCreateInput("");
      setRootCreateError(null);
    } catch (e) {
      setRootCreateError(String(e));
    }
  }

  const isFiltering = search.trim() || activeTagFilter;
  const filteredProjects = isFiltering
    ? projects.filter(p => {
        const q = search.toLowerCase();
        return (!q || displayName(p).toLowerCase().includes(q))
          && (!activeTagFilter || p.tags.includes(activeTagFilter));
      })
    : [];

  // Destination folders for the move modal
  const moveDestinations: FolderEntry[] = moveTarget && folderTree && rootFolder
    ? [
        { name: `📂 Racine (${folderTree.name})`, path: rootFolder, depth: 0 },
        ...collectFolders(folderTree, moveTarget.path).filter(f => f.path !== rootFolder),
      ]
    : [];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="app-title">Print Gest</span>
        <div className="sidebar-header-actions">
          {rootFolder && (
            <>
              <button className="btn-icon" title="Nouveau dossier à la racine"
                onClick={() => { setRootCreating("folder"); setRootCreateInput(""); setRootCreateError(null); }}>
                📁+
              </button>
              <button className="btn-icon" title="Nouveau projet à la racine"
                onClick={() => { setRootCreating("project"); setRootCreateInput(""); setRootCreateError(null); }}>
                📄+
              </button>
            </>
          )}
          <button className="btn-icon" onClick={onSelectFolder} title="Changer de dossier">📁</button>
          <button className="btn-icon" onClick={onOpenSettings} title="Paramètres">⚙️</button>
        </div>
      </div>

      {rootFolder && (
        <button className={`sidebar-nav-btn ${showConsumablesView ? "active" : ""}`} onClick={onShowConsumables}>
          🧵 Consommables
        </button>
      )}

      {rootFolder && (
        <div className="folder-info">
          <span className="folder-name" title={rootFolder}>{folderName}</span>
          <button className="btn-refresh" onClick={() => onRefresh()} title="Rafraîchir" disabled={loading}>↺</button>
        </div>
      )}

      {rootCreating && rootFolder && (
        <div className="new-project-form">
          <input className="new-project-input" autoFocus
            placeholder={rootCreating === "folder" ? "Nom du dossier…" : "Nom du projet…"}
            value={rootCreateInput}
            onChange={e => { setRootCreateInput(e.target.value); setRootCreateError(null); }}
            onKeyDown={e => {
              if (e.key === "Enter") handleRootCreate();
              if (e.key === "Escape") setRootCreating(null);
            }}
          />
          {rootCreating === "project" && rootCreateInput.trim() && (
            <div className="new-project-hint">📁 {toCamelCasePreview(rootCreateInput)}</div>
          )}
          {rootCreateError && <div className="new-project-error">{rootCreateError}</div>}
          <div className="new-project-actions">
            <button className="btn-cancel" onClick={() => setRootCreating(null)}>Annuler</button>
            <button className="btn-save" onClick={handleRootCreate} disabled={!rootCreateInput.trim()}>Créer</button>
          </div>
        </div>
      )}

      {rootFolder && (
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Rechercher…"
            value={search} onChange={e => onSearchChange(e.target.value)} />
          {search && <button className="search-clear" onClick={() => onSearchChange("")}>✕</button>}
        </div>
      )}

      {activeTagFilter && (
        <div className="tag-filter-bar">
          <span>🏷️ {activeTagFilter}</span>
          <button onClick={onClearTagFilter} title="Effacer le filtre">✕</button>
        </div>
      )}

      <div className="project-list">
        {loading && <p className="status-msg">Chargement…</p>}
        {error && <p className="status-msg error">{error}</p>}

        {isFiltering ? (
          filteredProjects.length === 0
            ? <p className="status-msg">{activeTagFilter ? "Aucun projet avec ce tag." : "Aucun résultat."}</p>
            : filteredProjects.map(p => (
                <button key={p.path}
                  className={`project-item ${selected?.path === p.path ? "active" : ""}`}
                  onClick={() => onSelectProject(p)}
                >
                  <span className="project-item-name">{displayName(p)}</span>
                  <span className="project-item-meta">
                    {p.status === "done" && <span className="badge badge-done">✓</span>}
                  </span>
                  {p.tags.length > 0 && (
                    <span className="project-item-tags">
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
                </button>
              ))
        ) : (
          !loading && folderTree && folderTree.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={0}
              selected={selected}
              expanded={expanded}
              onSelect={onSelectProject}
              onToggle={toggleExpanded}
              onMove={(path, name) => { setMoveTarget({ path, name }); setMoveError(null); }}
              onRenamed={(oldPath, newPath) => {
                let selectPath: string | undefined;
                if (selected?.path.startsWith(oldPath)) {
                  selectPath = newPath + selected.path.slice(oldPath.length);
                }
                onRefresh(selectPath);
              }}
              onCreated={() => onRefresh()}
              onTagClick={onTagClick}
            />
          ))
        )}

        {!loading && !error && rootFolder && !isFiltering && folderTree?.children.length === 0 && (
          <p className="status-msg">Aucun projet trouvé.</p>
        )}
      </div>

      {/* Modal Déplacer vers */}
      {moveTarget && (
        <div className="move-modal-overlay" onClick={() => setMoveTarget(null)}>
          <div className="move-modal" onClick={e => e.stopPropagation()}>
            <div className="move-modal-header">
              <span>Déplacer <strong>{moveTarget.name}</strong> vers…</span>
              <button className="btn-icon" onClick={() => setMoveTarget(null)}>✕</button>
            </div>
            <div className="move-modal-list">
              {moveDestinations.map(dest => (
                <button key={dest.path} className="move-dest-btn"
                  style={{ paddingLeft: 12 + dest.depth * 14 }}
                  onClick={() => handleMove(dest.path)}
                >
                  {dest.name}
                </button>
              ))}
            </div>
            {moveError && <div className="move-modal-error">{moveError}</div>}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        {projects.length > 0 && (
          <span>{projects.length} projet{projects.length > 1 ? "s" : ""}</span>
        )}
        {appVersion && <span className="sidebar-version">v{appVersion}</span>}
      </div>
    </aside>
  );
}

export { sortedInsert };
