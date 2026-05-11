import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Project, Consumable, PrintSession,
  FolderNode, flattenProjects, updateProjectInTree,
} from "./model";
import { Printer } from "./model/printer";
import { displayName, toolName } from "./utils/format";
import { useThumbnails } from "./hooks/useThumbnails";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import { Sidebar } from "./components/Sidebar";
import { ConsumablesView } from "./components/ConsumablesView";
import { SummaryBar } from "./components/SummaryBar";
import { ProjectHeader } from "./components/ProjectHeader";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { DescriptionTab } from "./components/DescriptionTab";
import { SessionsTab } from "./components/SessionsTab";
import { ConfigTab } from "./components/ConfigTab";
import { FilesTab } from "./components/FilesTab";
import { CostTab } from "./components/CostTab";
import "./App.css";

const STORAGE_KEY = "print-gest-root-folder";
const TOOL_KEY = "print-gest-tool-path";

function App() {
  const [rootFolder, setRootFolder] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const selectedRef = useRef<Project | null>(null);
  selectedRef.current = selected;

  const { thumbnails, stlData, printInfoMap } = useThumbnails(selected);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [toolPath, setToolPath] = useState<string | null>(
    () => localStorage.getItem(TOOL_KEY)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [electricityPrice, setElectricityPrice] = useState(0);
  const [showConsumablesView, setShowConsumablesView] = useState(false);

  const [rightTab, setRightTab] = useState<"description" | "sessions" | "costs" | "config" | "files">("description");
  const [videoModal, setVideoModal] = useState<{ src: string; name: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; filePath: string } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // ── Helper : mettre à jour un projet dans les 3 états ─────────────────────

  function applyProjectUpdate(updated: Project) {
    setSelected(prev => prev?.path === updated.path ? updated : prev);
    setProjects(prev => prev.map(p => p.path === updated.path ? updated : p));
    setFolderTree(prev => prev ? updateProjectInTree(prev, updated) : prev);
  }

  // ── Scan complet (changement de dossier racine) ────────────────────────────

  const scanFolder = useCallback(async (folderPath: string) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setEditorOpen(false);
    setShowConsumablesView(false);
    try {
      const [tree, cons, prints, kwh] = await Promise.all([
        invoke<FolderNode>("scan_folder_tree", { folderPath }),
        invoke<Consumable[]>("get_consumables", { rootPath: folderPath }).catch(() => [] as Consumable[]),
        invoke<Printer[]>("get_printers", { rootPath: folderPath }).catch(() => [] as Printer[]),
        invoke<number>("get_electricity_price", { rootPath: folderPath }).catch(() => 0),
      ]);
      setFolderTree(tree);
      setProjects(flattenProjects(tree));
      setConsumables(cons);
      setPrinters(prints);
      setElectricityPrice(kwh);
    } catch (e) {
      setError(String(e));
      setFolderTree(null);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Refresh léger (conserve la sélection) ─────────────────────────────────

  const refreshTree = useCallback(async (folderPath: string, selectPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const tree = await invoke<FolderNode>("scan_folder_tree", { folderPath });
      setFolderTree(tree);
      const flat = flattenProjects(tree);
      setProjects(flat);
      if (selectPath) {
        const p = flat.find(x => x.path === selectPath);
        if (p) { setSelected(p); setShowConsumablesView(false); }
      } else {
        setSelected(prev => prev ? (flat.find(p => p.path === prev.path) ?? null) : null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rootFolder) scanFolder(rootFolder);
  }, [rootFolder, scanFolder]);

  // Reset UI quand on change de projet
  useEffect(() => {
    setEditorOpen(false);
    setRightTab("description");
  }, [selected?.path]);

  // ── Drag & Drop fichiers vers projet ──────────────────────────────────────

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
          }).then(applyProjectUpdate);
        }
      })
      .then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  // ── Sélection du dossier racine ───────────────────────────────────────────

  const handleSelectFolder = async () => {
    const picked = await open({
      directory: true, multiple: false,
      title: "Sélectionner le dossier des projets",
    });
    if (picked && typeof picked === "string") {
      setRootFolder(picked);
      localStorage.setItem(STORAGE_KEY, picked);
    }
  };

  // ── Persistance sessions ──────────────────────────────────────────────────

  const persistSessions = async (
    sessions: PrintSession[],
    status: string,
    quantity: number,
    opts?: { designTimeH?: number; designRate?: number; sellingPrice?: number },
  ) => {
    if (!selected) return;
    const updated = await invoke<Project>("save_project_sessions", {
      projectPath: selected.path,
      sessions,
      status,
      quantity: Math.max(1, quantity),
      designTimeH: opts?.designTimeH ?? selected.design_time_h,
      designRate: opts?.designRate ?? selected.design_rate,
      sellingPrice: opts?.sellingPrice ?? selected.selling_price,
    });
    applyProjectUpdate(updated);
  };

  const handleChangeStatus = () => {
    if (!selected) return;
    persistSessions(selected.sessions, selected.status === "done" ? "draft" : "done", selected.quantity);
  };

  const handleChangeQuantity = (delta: number) => {
    if (!selected) return;
    persistSessions(selected.sessions, selected.status, selected.quantity + delta);
  };

  const handleSavePricing = (designTimeH: number, designRate: number, sellingPrice: number) => {
    if (!selected) return;
    persistSessions(selected.sessions, selected.status, selected.quantity, { designTimeH, designRate, sellingPrice });
  };

  // ── Tags ──────────────────────────────────────────────────────────────────

  const handleAddTag = async (tag: string) => {
    if (!selected || selected.tags.includes(tag)) return;
    const newTags = [...selected.tags, tag];
    await invoke("save_tags", { projectPath: selected.path, tags: newTags });
    applyProjectUpdate({ ...selected, tags: newTags });
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selected) return;
    const newTags = selected.tags.filter(t => t !== tag);
    await invoke("save_tags", { projectPath: selected.path, tags: newTags });
    applyProjectUpdate({ ...selected, tags: newTags });
    if (activeTagFilter === tag) setActiveTagFilter(null);
  };

  // ── Éditeur Markdown ──────────────────────────────────────────────────────

  const handleSave = async (content: string): Promise<void> => {
    if (!selected) return;
    await invoke("save_markdown", { projectPath: selected.path, content });
    applyProjectUpdate({ ...selected, markdown_content: content });
    setEditorOpen(false);
  };

  // ── Outil externe ─────────────────────────────────────────────────────────

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
    invoke("open_with_tool", { filePath, toolPath }).catch(e => alert(`Erreur : ${e}`));
  };

  const handleArchiveFile = (filePath: string) => {
    if (!selected) return;
    invoke<Project>("archive_file", { filePath })
      .then(applyProjectUpdate)
      .catch(e => alert(`Erreur archivage : ${e}`));
  };

  const buildContextMenuItems = (filePath: string): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (toolPath) {
      items.push({ label: `Ouvrir avec ${toolName(toolPath)}`, icon: "🚀", onClick: () => handleOpenWith(filePath) });
    } else {
      items.push({ label: "Configurer un outil externe…", icon: "⚙️", onClick: () => setSettingsOpen(true) });
    }
    items.push({ label: "Archiver", icon: "📦", onClick: () => handleArchiveFile(filePath) });
    return items;
  };

  return (
    <div className="app">
      <Sidebar
        rootFolder={rootFolder}
        folderTree={folderTree}
        projects={projects}
        selected={selected}
        loading={loading}
        error={error}
        showConsumablesView={showConsumablesView}
        search={search}
        activeTagFilter={activeTagFilter}
        onSelectProject={p => { setSelected(p); setShowConsumablesView(false); }}
        onSelectFolder={handleSelectFolder}
        onRefresh={(selectPath) => rootFolder && refreshTree(rootFolder, selectPath)}
        onShowConsumables={() => { setShowConsumablesView(true); setSelected(null); }}
        onOpenSettings={() => setSettingsOpen(true)}
        onSearchChange={setSearch}
        onClearTagFilter={() => setActiveTagFilter(null)}
        onTagClick={tag => setActiveTagFilter(prev => prev === tag ? null : tag)}
        onProjectCreated={p => {
          if (rootFolder) refreshTree(rootFolder, p.path);
        }}
      />

      <main className="content">
        {!rootFolder ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h2>Bienvenue dans Print Gest</h2>
            <p>Sélectionne le dossier contenant tes projets d'impression 3D.</p>
            <button className="btn-primary" onClick={handleSelectFolder}>Choisir un dossier</button>
          </div>
        ) : showConsumablesView ? (
          <ConsumablesView
            rootFolder={rootFolder}
            consumables={consumables}
            printers={printers}
            electricityPrice={electricityPrice}
            onConsumablesChange={setConsumables}
            onPrintersChange={setPrinters}
            onElectricityChange={setElectricityPrice}
          />
        ) : !selected ? (
          <div className="empty-state">
            <div className="empty-icon">🖨️</div>
            <p>Sélectionne un projet dans la liste.</p>
          </div>
        ) : (
          <div className="project-detail">
            {isDragging && (
              <div className="drop-overlay">
                <div className="drop-overlay-inner">
                  <div className="drop-icon">📥</div>
                  <p>Déposer les fichiers dans</p>
                  <strong>{displayName(selected)}</strong>
                </div>
              </div>
            )}

            <ProjectHeader
              selected={selected}
              activeTagFilter={activeTagFilter}
              onTagFilterChange={setActiveTagFilter}
              onStatusChange={handleChangeStatus}
              onRenamed={updated => {
                applyProjectUpdate(updated);
                if (rootFolder) refreshTree(rootFolder, updated.path);
              }}
              onTagAdded={handleAddTag}
              onTagRemoved={handleRemoveTag}
            />

            <div className="project-body">
              <SummaryBar
                selected={selected}
                thumbnails={thumbnails}
                consumables={consumables}
                printers={printers}
                electricityPrice={electricityPrice}
              />

              <div className="project-main-panel">
                {editorOpen ? (
                  <MarkdownEditor
                    project={selected}
                    onSave={handleSave}
                    onClose={() => setEditorOpen(false)}
                  />
                ) : (
                  <>
                    <div className="main-tabs">
                      <button className={`main-tab-btn ${rightTab === "description" ? "active" : ""}`}
                        onClick={() => setRightTab("description")}>📝 Description</button>
                      <button className={`main-tab-btn ${rightTab === "sessions" ? "active" : ""}`}
                        onClick={() => setRightTab("sessions")}>🗓 Sessions</button>
                      <button className={`main-tab-btn ${rightTab === "costs" ? "active" : ""}`}
                        onClick={() => setRightTab("costs")}>💰 Coûts</button>
                      <button className={`main-tab-btn ${rightTab === "config" ? "active" : ""}`}
                        onClick={() => setRightTab("config")}>⚙️ Configuration</button>
                      <button className={`main-tab-btn ${rightTab === "files" ? "active" : ""}`}
                        onClick={() => setRightTab("files")}>📁 Fichiers</button>
                    </div>

                    <div className="tab-content">
                      {rightTab === "description" && (
                        <DescriptionTab selected={selected} onEdit={() => setEditorOpen(true)} />
                      )}
                      {rightTab === "sessions" && (
                        <SessionsTab
                          selected={selected}
                          thumbnails={thumbnails}
                          consumables={consumables}
                          printers={printers}
                          electricityPrice={electricityPrice}
                          onSessionsChange={sessions =>
                            persistSessions(sessions, selected.status, selected.quantity)
                          }
                        />
                      )}
                      {rightTab === "costs" && (
                        <CostTab
                          selected={selected}
                          consumables={consumables}
                          printers={printers}
                          electricityPrice={electricityPrice}
                        />
                      )}
                      {rightTab === "config" && (
                        <ConfigTab
                          selected={selected}
                          onQuantityChange={handleChangeQuantity}
                          onPricingChange={handleSavePricing}
                        />
                      )}
                      {rightTab === "files" && (
                        <FilesTab
                          selected={selected}
                          thumbnails={thumbnails}
                          stlData={stlData}
                          printInfoMap={printInfoMap}
                          toolPath={toolPath}
                          onContextMenu={(x, y, fp) => setContextMenu({ x, y, filePath: fp })}
                          onVideoPlay={(src, name) => setVideoModal({ src, name })}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Paramètres</h2>
              <button className="btn-icon" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div className="modal-section">
              <label className="modal-label">Slicer / outil externe</label>
              <p className="modal-hint">Clic droit sur un fichier 3MF ou STL pour l'ouvrir avec cet outil.</p>
              <div className="tool-path-row">
                <span className="tool-path-display" title={toolPath ?? ""}>
                  {toolPath ? toolName(toolPath) : "Aucun outil configuré"}
                </span>
                <button className="btn-primary-sm" onClick={handlePickTool}>Parcourir…</button>
                {toolPath && <button className="btn-danger-sm" onClick={handleClearTool}>✕</button>}
              </div>
              {toolPath && <p className="tool-path-full">{toolPath}</p>}
            </div>
          </div>
        </div>
      )}

      {videoModal && (
        <div className="video-modal-overlay" onClick={() => setVideoModal(null)}>
          <div className="video-modal" onClick={e => e.stopPropagation()}>
            <div className="video-modal-header">
              <span className="video-modal-title">{videoModal.name}</span>
              <button className="btn-icon" onClick={() => setVideoModal(null)} title="Fermer">✕</button>
            </div>
            <video src={videoModal.src} controls autoPlay className="video-player" />
          </div>
        </div>
      )}

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
