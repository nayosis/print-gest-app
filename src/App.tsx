import { useState, useEffect, useCallback, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Project, ThumbnailMap } from "./types";
import { StlViewer } from "./StlViewer";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import "./App.css";

const STORAGE_KEY = "print-gest-root-folder";
const TOOL_KEY = "print-gest-tool-path";

function toolName(path: string): string {
  return path.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, "") ?? path;
}

// Couleurs de tags déterministes par nom
const TAG_PALETTE = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#dcfce7", text: "#166534" },
  { bg: "#fef3c7", text: "#92400e" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#ffedd5", text: "#9a3412" },
  { bg: "#e0f2fe", text: "#075985" },
  { bg: "#f0fdf4", text: "#14532d" },
];

function tagColor(tag: string) {
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

function displayName(p: Project) {
  return p.title ?? p.name;
}

function toCamelCasePreview(s: string): string {
  const words = s.trim().split(/\s+/);
  if (!words[0]) return "";
  return (
    words[0].toLowerCase() +
    words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")
  );
}

function App() {
  const [rootFolder, setRootFolder] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const selectedRef = useRef<Project | null>(null);
  selectedRef.current = selected;

  const [thumbnails, setThumbnails] = useState<ThumbnailMap>({});
  const [stlData, setStlData] = useState<{ [k: string]: string | null }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false);

  // Outil externe (slicer)
  const [toolPath, setToolPath] = useState<string | null>(
    () => localStorage.getItem(TOOL_KEY)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Tags
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  // Recherche
  const [search, setSearch] = useState("");

  // Lecteur vidéo
  const [videoModal, setVideoModal] = useState<{ src: string; name: string } | null>(null);

  // Menu contextuel
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);

  // Nouveau projet
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectError, setNewProjectError] = useState<string | null>(null);
  const [newProjectLoading, setNewProjectLoading] = useState(false);

  // Éditeur Markdown
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Renommage
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);

  // ── Helpers ──

  const sortedInsert = (list: Project[], project: Project): Project[] =>
    [...list.filter((p) => p.path !== project.path), project].sort((a, b) =>
      displayName(a).toLowerCase().localeCompare(displayName(b).toLowerCase())
    );

  // ── Scan dossier racine ──

  const scanFolder = useCallback(async (folderPath: string) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setThumbnails({});
    setEditorOpen(false);
    setRenaming(false);
    setNewProjectOpen(false);
    try {
      const result = await invoke<Project[]>("scan_projects", { folderPath });
      setProjects(result);
    } catch (e) {
      setError(String(e));
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rootFolder) scanFolder(rootFolder);
  }, [rootFolder, scanFolder]);

  // ── Miniatures 3MF + données STL ──

  useEffect(() => {
    setThumbnails({});
    setStlData({});
    if (!selected) return;

    for (const filename of selected.files_3mf) {
      const filePath = `${selected.path}\\${filename}`;
      invoke<string | null>("get_3mf_thumbnail", { filePath }).then((b64) =>
        setThumbnails((prev) => ({ ...prev, [filename]: b64 }))
      );
    }

    for (const filename of selected.stl_files) {
      const filePath = `${selected.path}\\${filename}`;
      invoke<string | null>("read_file_base64", { filePath }).then((b64) =>
        setStlData((prev) => ({ ...prev, [filename]: b64 }))
      );
    }
  }, [selected]);

  // Reset états UI quand on change de projet
  useEffect(() => {
    setEditorOpen(false);
    setRenaming(false);
    setAddingTag(false);
    setTagInput("");
    setSaveError(null);
    setRenameError(null);
  }, [selected?.path]);

  // ── Drag & Drop (Tauri OS-level) ──

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        const current = selectedRef.current;

        if (event.payload.type === "over") {
          if (current) setIsDragging(true);
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          if (!current) return;

          const paths: string[] = (event.payload as { paths: string[] }).paths;
          if (paths.length === 0) return;

          invoke<Project>("copy_files_to_project", {
            projectPath: current.path,
            filePaths: paths,
          }).then((updated) => {
            setSelected(updated);
            setProjects((prev) => sortedInsert(prev, updated));
          });
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => unlisten?.();
  }, []);

  // ── Sélection du dossier racine ──

  const handleSelectFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Sélectionner le dossier des projets",
    });
    if (picked && typeof picked === "string") {
      setRootFolder(picked);
      localStorage.setItem(STORAGE_KEY, picked);
    }
  };

  // ── Nouveau projet ──

  const handleCreateProject = async () => {
    if (!rootFolder || !newProjectTitle.trim()) return;
    setNewProjectLoading(true);
    setNewProjectError(null);
    try {
      const project = await invoke<Project>("create_project", {
        rootPath: rootFolder,
        title: newProjectTitle.trim(),
      });
      setProjects((prev) => sortedInsert(prev, project));
      setSelected(project);
      setNewProjectOpen(false);
      setNewProjectTitle("");
    } catch (e) {
      setNewProjectError(String(e));
    } finally {
      setNewProjectLoading(false);
    }
  };

  // ── Éditeur Markdown ──

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError(null);
    try {
      await invoke("save_markdown", {
        projectPath: selected.path,
        content: editorContent,
      });
      const updated = { ...selected, markdown_content: editorContent };
      setSelected(updated);
      setProjects((prev) => sortedInsert(prev, updated));
      setEditorOpen(false);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Renommage ──

  const handleRename = async () => {
    if (!selected || !renameValue.trim()) return;
    setRenameLoading(true);
    setRenameError(null);
    try {
      const updated = await invoke<Project>("rename_project", {
        projectPath: selected.path,
        newTitle: renameValue.trim(),
      });
      setSelected(updated);
      setProjects((prev) => sortedInsert(prev, updated));
      setRenaming(false);
    } catch (e) {
      setRenameError(String(e));
    } finally {
      setRenameLoading(false);
    }
  };

  // ── Tags ──

  const handleAddTag = async () => {
    const tag = tagInput.trim();
    if (!selected || !tag || selected.tags.includes(tag)) {
      setAddingTag(false);
      setTagInput("");
      return;
    }
    const newTags = [...selected.tags, tag];
    await invoke("save_tags", { projectPath: selected.path, tags: newTags });
    const updated = { ...selected, tags: newTags };
    setSelected(updated);
    setProjects((prev) => sortedInsert(prev, updated));
    setTagInput("");
    setAddingTag(false);
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selected) return;
    const newTags = selected.tags.filter((t) => t !== tag);
    await invoke("save_tags", { projectPath: selected.path, tags: newTags });
    const updated = { ...selected, tags: newTags };
    setSelected(updated);
    setProjects((prev) => sortedInsert(prev, updated));
    if (activeTagFilter === tag) setActiveTagFilter(null);
  };

  // ── Outil externe ──

  const handlePickTool = async () => {
    const picked = await open({
      multiple: false,
      title: "Sélectionner l'exécutable du slicer",
      filters: [{ name: "Exécutable", extensions: ["exe"] }],
    });
    if (picked && typeof picked === "string") {
      setToolPath(picked);
      localStorage.setItem(TOOL_KEY, picked);
    }
  };

  const handleClearTool = () => {
    setToolPath(null);
    localStorage.removeItem(TOOL_KEY);
  };

  const handleOpenWith = (filePath: string) => {
    if (!toolPath) return;
    invoke("open_with_tool", { filePath, toolPath }).catch((e) =>
      alert(`Erreur : ${e}`)
    );
  };

  const buildContextMenuItems = (filePath: string): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (toolPath) {
      items.push({
        label: `Ouvrir avec ${toolName(toolPath)}`,
        icon: "🚀",
        onClick: () => handleOpenWith(filePath),
      });
    } else {
      items.push({
        label: "Configurer un outil externe…",
        icon: "⚙️",
        onClick: () => setSettingsOpen(true),
      });
    }
    return items;
  };

  const folderName = rootFolder
    ? rootFolder.split(/[\\/]/).filter(Boolean).at(-1)
    : null;

  const visibleProjects = projects.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchText = !q || displayName(p).toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
    const matchTag = !activeTagFilter || p.tags.includes(activeTagFilter);
    return matchText && matchTag;
  });

  const totalFiles = selected
    ? selected.f3d_files.length + selected.files_3mf.length + selected.stl_files.length
    : 0;

  return (
    <div className="app">
      {/* ── Sidebar ── */}
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
              onClick={handleSelectFolder}
              title="Changer de dossier"
            >
              📁
            </button>
            <button
              className="btn-icon"
              onClick={() => setSettingsOpen(true)}
              title="Paramètres"
            >
              ⚙️
            </button>
          </div>
        </div>

        {rootFolder && (
          <div className="folder-info">
            <span className="folder-name" title={rootFolder}>
              {folderName}
            </span>
            <button
              className="btn-refresh"
              onClick={() => scanFolder(rootFolder)}
              title="Rafraîchir"
              disabled={loading}
            >
              ↺
            </button>
          </div>
        )}

        {/* Formulaire nouveau projet */}
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

        {/* Barre de recherche */}
        {rootFolder && (
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}>✕</button>
            )}
          </div>
        )}

        {/* Filtre tag actif */}
        {activeTagFilter && (
          <div className="tag-filter-bar">
            <span>🏷️ {activeTagFilter}</span>
            <button onClick={() => setActiveTagFilter(null)} title="Effacer le filtre">✕</button>
          </div>
        )}

        <div className="project-list">
          {loading && <p className="status-msg">Chargement…</p>}
          {error && <p className="status-msg error">{error}</p>}
          {!loading && !error && rootFolder && visibleProjects.length === 0 && (
            <p className="status-msg">
              {activeTagFilter ? "Aucun projet avec ce tag." : "Aucun projet trouvé."}
            </p>
          )}
          {visibleProjects.map((project) => (
            <button
              key={project.path}
              className={`project-item ${selected?.path === project.path ? "active" : ""}`}
              onClick={() => setSelected(project)}
            >
              <span className="project-item-name">{displayName(project)}</span>
              <span className="project-item-meta">
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
            {visibleProjects.length}
            {activeTagFilter ? ` / ${projects.length}` : ""} projet{projects.length > 1 ? "s" : ""}
          </div>
        )}
      </aside>

      {/* ── Contenu principal ── */}
      <main className="content">
        {!rootFolder ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h2>Bienvenue dans Print Gest</h2>
            <p>Sélectionne le dossier contenant tes projets d'impression 3D.</p>
            <button className="btn-primary" onClick={handleSelectFolder}>
              Choisir un dossier
            </button>
          </div>
        ) : !selected ? (
          <div className="empty-state">
            <div className="empty-icon">🖨️</div>
            <p>Sélectionne un projet dans la liste.</p>
          </div>
        ) : editorOpen ? (
          /* ── Éditeur Markdown ── */
          <div className="editor-wrap">
            <div className="editor-header">
              <span className="editor-title">
                {displayName(selected)} — <code>main.md</code>
              </span>
              <div className="editor-tabs">
                <button
                  className={`editor-tab ${editorTab === "edit" ? "active" : ""}`}
                  onClick={() => setEditorTab("edit")}
                >
                  Éditer
                </button>
                <button
                  className={`editor-tab ${editorTab === "preview" ? "active" : ""}`}
                  onClick={() => setEditorTab("preview")}
                >
                  Aperçu
                </button>
              </div>
              <div className="editor-actions">
                {saveError && <span className="save-error">{saveError}</span>}
                <button
                  className="btn-cancel"
                  onClick={() => setEditorOpen(false)}
                  disabled={saving}
                >
                  Annuler
                </button>
                <button
                  className="btn-save"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Sauvegarde…" : "Sauvegarder"}
                </button>
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
                {editorContent.trim() ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editorContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="empty-files">Rien à prévisualiser.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── Vue projet ── */
          <div className="project-detail">
            {/* Overlay drag & drop */}
            {isDragging && (
              <div className="drop-overlay">
                <div className="drop-overlay-inner">
                  <div className="drop-icon">📥</div>
                  <p>Déposer les fichiers dans</p>
                  <strong>{displayName(selected)}</strong>
                </div>
              </div>
            )}

            {/* En-tête avec renommage */}
            {renaming ? (
              <div className="rename-form">
                <input
                  className="rename-input"
                  value={renameValue}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setRenameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  placeholder="Nom du projet"
                  autoFocus
                />
                <div className="rename-hint">
                  Dossier :{" "}
                  <code>
                    {renameValue.trim()
                      ? toCamelCasePreview(renameValue)
                      : "…"}
                  </code>
                </div>
                {renameError && (
                  <p className="rename-error">{renameError}</p>
                )}
                <div className="rename-actions">
                  <button
                    className="btn-cancel"
                    onClick={() => setRenaming(false)}
                    disabled={renameLoading}
                  >
                    Annuler
                  </button>
                  <button
                    className="btn-save"
                    onClick={handleRename}
                    disabled={renameLoading || !renameValue.trim()}
                  >
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
                <button
                  className="btn-rename"
                  onClick={() => {
                    setRenameValue(displayName(selected));
                    setRenameError(null);
                    setRenaming(true);
                  }}
                  title="Renommer le projet"
                >
                  ✏️ Renommer
                </button>
              </div>
            )}

            {/* Tags */}
            <div className="tags-row">
              {selected.tags.map((tag) => {
                const { bg, text } = tagColor(tag);
                return (
                  <span
                    key={tag}
                    className="tag-chip"
                    style={{ background: bg, color: text }}
                    onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                    title="Cliquer pour filtrer"
                  >
                    {tag}
                    <button
                      className="tag-remove"
                      style={{ color: text }}
                      onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}
                      title="Supprimer ce tag"
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
                <button
                  className="tag-add-btn"
                  onClick={() => setAddingTag(true)}
                  title="Ajouter un tag"
                >
                  + Tag
                </button>
              )}
            </div>

            {/* Fichiers d'impression : 3MF + STL */}
            {(selected.files_3mf.length > 0 || selected.stl_files.length > 0) && (
              <section className="detail-section">
                <h2>Fichiers d'impression</h2>
                <div className="thumb-grid">
                  {selected.files_3mf.map((file) => {
                    const b64 = thumbnails[file];
                    const isLoading = !(file in thumbnails);
                    return (
                      <div
                        key={file}
                        className="thumb-card"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, filePath: `${selected.path}\\${file}` });
                        }}
                      >
                        <div className="thumb-img-wrap">
                          {isLoading ? (
                            <div className="thumb-placeholder loading">⏳</div>
                          ) : b64 ? (
                            <img src={`data:image/png;base64,${b64}`} alt={file} className="thumb-img" />
                          ) : (
                            <div className="thumb-placeholder">📦</div>
                          )}
                        </div>
                        <span className="thumb-type-badge">3MF</span>
                        <span className="thumb-label" title={file}>{file}</span>
                      </div>
                    );
                  })}
                  {selected.stl_files.map((file) => {
                    const data = stlData[file];
                    const isLoading = !(file in stlData);
                    return (
                      <div
                        key={file}
                        className="thumb-card"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY, filePath: `${selected.path}\\${file}` });
                        }}
                      >
                        <div className="thumb-img-wrap">
                          {isLoading ? (
                            <div className="thumb-placeholder loading">⏳</div>
                          ) : data ? (
                            <StlViewer base64={data} />
                          ) : (
                            <div className="thumb-placeholder">📐</div>
                          )}
                        </div>
                        <span className="thumb-type-badge thumb-type-stl">STL</span>
                        <span className="thumb-label" title={file}>{file}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Fichiers F3D */}
            {selected.f3d_files.length > 0 && (
              <section className="detail-section">
                <h2>Fichiers Fusion 360 (.f3d)</h2>
                <ul className="file-list">
                  {selected.f3d_files.map((file) => (
                    <li key={file} className="file-item">
                      <span className="file-icon">📐</span>
                      {file}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {totalFiles === 0 && (
              <section className="detail-section">
                <div className="drop-hint">
                  <span>📥</span>
                  <p>Glisse tes fichiers .3mf ou .f3d ici pour les ajouter au projet.</p>
                </div>
              </section>
            )}

            {/* Timelapses MP4 */}
            {selected.mp4_files.length > 0 && (
              <section className="detail-section">
                <h2>Timelapses</h2>
                <div className="video-grid">
                  {selected.mp4_files.map((file) => {
                    const src = convertFileSrc(`${selected.path}\\${file}`);
                    return (
                      <button
                        key={file}
                        className="video-card"
                        onClick={() => setVideoModal({ src, name: file })}
                      >
                        <video
                          src={src}
                          className="video-thumb"
                          muted
                          preload="metadata"
                        />
                        <div className="video-card-overlay">
                          <span className="video-play-icon">▶</span>
                        </div>
                        <span className="video-label" title={file}>{file}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Description Markdown */}
            <section className="detail-section">
              <div className="section-header-row">
                <h2>Description (main.md)</h2>
                <button
                  className="btn-edit"
                  onClick={() => {
                    setEditorContent(selected.markdown_content ?? "");
                    setEditorTab("edit");
                    setSaveError(null);
                    setEditorOpen(true);
                  }}
                >
                  {selected.markdown_content ? "✏️ Modifier" : "✏️ Créer"}
                </button>
              </div>
              {selected.markdown_content ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selected.markdown_content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="empty-files">
                  Aucun fichier main.md — clique sur "Créer" pour en rédiger
                  un.
                </p>
              )}
            </section>
          </div>
        )}
      </main>

      {/* ── Modal paramètres ── */}
      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Paramètres</h2>
              <button className="btn-icon" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>

            <div className="modal-section">
              <label className="modal-label">Slicer / outil externe</label>
              <p className="modal-hint">
                Clic droit sur un fichier 3MF ou STL pour l'ouvrir avec cet outil.
              </p>
              <div className="tool-path-row">
                <span className="tool-path-display" title={toolPath ?? ""}>
                  {toolPath ? toolName(toolPath) : "Aucun outil configuré"}
                </span>
                <button className="btn-primary-sm" onClick={handlePickTool}>
                  Parcourir…
                </button>
                {toolPath && (
                  <button className="btn-danger-sm" onClick={handleClearTool}>
                    ✕
                  </button>
                )}
              </div>
              {toolPath && <p className="tool-path-full">{toolPath}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal lecteur vidéo ── */}
      {videoModal && (
        <div
          className="video-modal-overlay"
          onClick={() => setVideoModal(null)}
        >
          <div className="video-modal" onClick={(e) => e.stopPropagation()}>
            <div className="video-modal-header">
              <span className="video-modal-title">{videoModal.name}</span>
              <button
                className="btn-icon"
                onClick={() => setVideoModal(null)}
                title="Fermer"
              >
                ✕
              </button>
            </div>
            <video
              src={videoModal.src}
              controls
              autoPlay
              className="video-player"
            />
          </div>
        </div>
      )}

      {/* ── Menu contextuel ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.filePath)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default App;
