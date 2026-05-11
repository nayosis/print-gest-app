import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project } from "../model";
import { displayName, toCamelCasePreview, sortedInsert } from "../utils/format";
import { tagColor } from "../utils/color";

interface SidebarProps {
  rootFolder: string | null;
  projects: Project[];
  selected: Project | null;
  loading: boolean;
  error: string | null;
  showConsumablesView: boolean;
  search: string;
  activeTagFilter: string | null;
  onSelectProject: (p: Project) => void;
  onSelectFolder: () => void;
  onRefresh: () => void;
  onShowConsumables: () => void;
  onOpenSettings: () => void;
  onSearchChange: (s: string) => void;
  onClearTagFilter: () => void;
  onTagClick: (tag: string) => void;
  onProjectCreated: (p: Project) => void;
}

export function Sidebar({
  rootFolder,
  projects,
  selected,
  loading,
  error,
  showConsumablesView,
  search,
  activeTagFilter,
  onSelectProject,
  onSelectFolder,
  onRefresh,
  onShowConsumables,
  onOpenSettings,
  onSearchChange,
  onClearTagFilter,
  onTagClick,
  onProjectCreated,
}: SidebarProps) {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectError, setNewProjectError] = useState<string | null>(null);
  const [newProjectLoading, setNewProjectLoading] = useState(false);

  const folderName = rootFolder
    ? rootFolder.split(/[\\/]/).filter(Boolean).at(-1)
    : null;

  const handleCreateProject = async () => {
    if (!rootFolder || !newProjectTitle.trim()) return;
    setNewProjectLoading(true);
    setNewProjectError(null);
    try {
      const project = await invoke<Project>("create_project", {
        rootPath: rootFolder,
        title: newProjectTitle.trim(),
      });
      onProjectCreated(project);
      setNewProjectOpen(false);
      setNewProjectTitle("");
    } catch (e) {
      setNewProjectError(String(e));
    } finally {
      setNewProjectLoading(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="app-title">Print Gest</span>
        <div className="sidebar-header-actions">
          {rootFolder && (
            <button
              className="btn-icon"
              onClick={() => {
                setNewProjectOpen((v) => !v);
                setNewProjectTitle("");
                setNewProjectError(null);
              }}
              title="Nouveau projet"
            >
              ＋
            </button>
          )}
          <button
            className="btn-icon"
            onClick={onSelectFolder}
            title="Changer de dossier"
          >
            📁
          </button>
          <button
            className="btn-icon"
            onClick={onOpenSettings}
            title="Paramètres"
          >
            ⚙️
          </button>
        </div>
      </div>

      {rootFolder && (
        <button
          className={`sidebar-nav-btn ${showConsumablesView ? "active" : ""}`}
          onClick={onShowConsumables}
        >
          🧵 Consommables
        </button>
      )}

      {rootFolder && (
        <div className="folder-info">
          <span className="folder-name" title={rootFolder}>
            {folderName}
          </span>
          <button
            className="btn-refresh"
            onClick={onRefresh}
            title="Rafraîchir"
            disabled={loading}
          >
            ↺
          </button>
        </div>
      )}

      {newProjectOpen && rootFolder && (
        <div className="new-project-form">
          <input
            className="new-project-input"
            placeholder="Nom du projet…"
            value={newProjectTitle}
            onChange={(e) => {
              setNewProjectTitle(e.target.value);
              setNewProjectError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateProject();
              if (e.key === "Escape") setNewProjectOpen(false);
            }}
            autoFocus
          />
          {newProjectTitle.trim() && (
            <div className="new-project-hint">
              📁 {toCamelCasePreview(newProjectTitle)}
            </div>
          )}
          {newProjectError && (
            <div className="new-project-error">{newProjectError}</div>
          )}
          <div className="new-project-actions">
            <button
              className="btn-cancel"
              onClick={() => setNewProjectOpen(false)}
              disabled={newProjectLoading}
            >
              Annuler
            </button>
            <button
              className="btn-save"
              onClick={handleCreateProject}
              disabled={newProjectLoading || !newProjectTitle.trim()}
            >
              {newProjectLoading ? "…" : "Créer"}
            </button>
          </div>
        </div>
      )}

      {rootFolder && (
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => onSearchChange("")}>✕</button>
          )}
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
        {!loading && !error && rootFolder && projects.length === 0 && (
          <p className="status-msg">
            {activeTagFilter ? "Aucun projet avec ce tag." : "Aucun projet trouvé."}
          </p>
        )}
        {projects.map((project) => (
          <button
            key={project.path}
            className={`project-item ${selected?.path === project.path ? "active" : ""}`}
            onClick={() => onSelectProject(project)}
          >
            <span className="project-item-name">{displayName(project)}</span>
            <span className="project-item-meta">
              {project.status === "done" && (
                <span className="badge badge-done">✓</span>
              )}
              {project.files_3mf.length > 0 && (
                <span className="badge">{project.files_3mf.length} 3mf</span>
              )}
              {project.stl_files.length > 0 && (
                <span className="badge badge-stl">{project.stl_files.length} stl</span>
              )}
              {project.f3d_files.length > 0 && (
                <span className="badge badge-f3d">{project.f3d_files.length} f3d</span>
              )}
              {project.markdown_content && (
                <span className="badge badge-md">doc</span>
              )}
            </span>
            {project.tags.length > 0 && (
              <span className="project-item-tags">
                {project.tags.map((tag) => {
                  const { bg, text } = tagColor(tag);
                  return (
                    <span
                      key={tag}
                      className="sidebar-tag"
                      style={{ background: bg, color: text }}
                      onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                    >
                      {tag}
                    </span>
                  );
                })}
              </span>
            )}
          </button>
        ))}
      </div>

      {projects.length > 0 && (
        <div className="sidebar-footer">
          {projects.length} projet{projects.length > 1 ? "s" : ""}
        </div>
      )}
    </aside>
  );
}

// Re-export sortedInsert for convenience (used in App.tsx via Sidebar callback)
export { sortedInsert };
