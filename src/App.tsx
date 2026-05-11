import { useState, useEffect, useCallback, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Project, ThumbnailMap, PrintInfo, Consumable, SessionConsumable, PrintSession, PriceMode, Printer } from "./types";

interface ConsFormData {
  id: string;
  name: string;
  category: string;
  price_mode: PriceMode;
  price: string;
}

interface PrinterFormData {
  id: string;
  name: string;
  power_w: string;
  wear_rate: string;
}

interface SessionForm {
  id: string;
  name: string;
  file_3mf: string;
  printer_id: string;
  print_time_h: string;
  consumables: SessionConsumable[];
  labor_time_h: string;
  labor_rate: string;
}

function calcCost(c: Consumable, qty: number): number {
  if (c.price_mode === "unit") return qty * c.price;
  return (qty / 1000) * c.price;
}
function unitLabel(c: Consumable): string {
  if (c.price_mode === "unit") return "unité(s)";
  if (c.price_mode === "weight") return "g";
  return "ml";
}
function priceUnitLabel(c: Consumable): string {
  if (c.price_mode === "unit") return "€/unité";
  if (c.price_mode === "weight") return "€/kg";
  return "€/L";
}
function printerCost(p: Printer, hours: number, kwh: number): number {
  return (p.power_w / 1000) * hours * kwh;
}
import { StlViewer } from "./StlViewer";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
import "./App.css";

const STORAGE_KEY = "print-gest-root-folder";
const TOOL_KEY = "print-gest-tool-path";

function toolName(path: string): string {
  return path.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, "") ?? path;
}

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

function newSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  const [printInfoMap, setPrintInfoMap] = useState<{ [k: string]: PrintInfo }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const [toolPath, setToolPath] = useState<string | null>(
    () => localStorage.getItem(TOOL_KEY)
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [electricityPrice, setElectricityPrice] = useState(0);
  const [showConsumablesView, setShowConsumablesView] = useState(false);
  const [consForm, setConsForm] = useState<ConsFormData | null>(null);
  const [printerForm, setPrinterForm] = useState<PrinterFormData | null>(null);
  const [editingKwh, setEditingKwh] = useState(false);
  const [kwhInput, setKwhInput] = useState("");

  // Sessions
  const [sessionForm, setSessionForm] = useState<SessionForm | null>(null);
  const [sessionConsPickId, setSessionConsPickId] = useState("");
  const [sessionConsPickQty, setSessionConsPickQty] = useState("");

  // Tarification (config tab)
  const [designTimeInput, setDesignTimeInput] = useState("");
  const [designRateInput, setDesignRateInput] = useState("");
  const [sellingPriceInput, setSellingPriceInput] = useState("");

  // Onglet panneau droit
  const [rightTab, setRightTab] = useState<"description" | "sessions" | "config" | "files">("description");

  const [videoModal, setVideoModal] = useState<{ src: string; name: string } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    filePath: string;
  } | null>(null);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectError, setNewProjectError] = useState<string | null>(null);
  const [newProjectLoading, setNewProjectLoading] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<"edit" | "preview">("edit");
  const [editorContent, setEditorContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setShowConsumablesView(false);
    try {
      const [result, cons, prints, kwh] = await Promise.all([
        invoke<Project[]>("scan_projects", { folderPath }),
        invoke<Consumable[]>("get_consumables", { rootPath: folderPath }).catch(() => [] as Consumable[]),
        invoke<Printer[]>("get_printers", { rootPath: folderPath }).catch(() => [] as Printer[]),
        invoke<number>("get_electricity_price", { rootPath: folderPath }).catch(() => 0),
      ]);
      setProjects(result);
      setConsumables(cons);
      setPrinters(prints);
      setElectricityPrice(kwh);
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
    setPrintInfoMap({});
    if (!selected) return;

    for (const filename of selected.files_3mf) {
      const filePath = `${selected.path}\\${filename}`;
      invoke<string | null>("get_3mf_thumbnail", { filePath }).then((b64) =>
        setThumbnails((prev) => ({ ...prev, [filename]: b64 }))
      );
      invoke<PrintInfo>("get_3mf_print_info", { filePath }).then((info) =>
        setPrintInfoMap((prev) => ({ ...prev, [filename]: info }))
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
    setSessionForm(null);
    setSessionConsPickId("");
    setSessionConsPickQty("");
    setRightTab("description");
    setDesignTimeInput(selected?.design_time_h ? selected.design_time_h.toString() : "");
    setDesignRateInput(selected?.design_rate ? selected.design_rate.toString() : "");
    setSellingPriceInput(selected?.selling_price ? selected.selling_price.toString() : "");
  }, [selected?.path]);

  // ── Drag & Drop ──

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

  // ── Consommables globaux ──

  const openBlankConsForm = () =>
    setConsForm({ id: "", name: "", category: "", price_mode: "unit", price: "" });

  const handleSaveConsumable = async () => {
    if (!consForm || !rootFolder) return;
    const priceNum = parseFloat(consForm.price);
    if (!consForm.name.trim() || isNaN(priceNum) || priceNum < 0) return;
    const cons: Consumable = {
      id: consForm.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: consForm.name.trim(),
      category: consForm.category.trim(),
      price_mode: consForm.price_mode,
      price: priceNum,
    };
    const updated = consForm.id
      ? consumables.map((c) => (c.id === consForm.id ? cons : c))
      : [...consumables, cons];
    await invoke("save_consumables", { rootPath: rootFolder, consumables: updated });
    setConsumables(updated);
    setConsForm(null);
  };

  const handleDeleteConsumable = async (id: string) => {
    if (!rootFolder) return;
    const updated = consumables.filter((c) => c.id !== id);
    await invoke("save_consumables", { rootPath: rootFolder, consumables: updated });
    setConsumables(updated);
  };

  // ── Imprimantes globales ──

  const handleSavePrinter = async () => {
    if (!printerForm || !rootFolder) return;
    const wNum = parseFloat(printerForm.power_w);
    if (!printerForm.name.trim() || isNaN(wNum) || wNum <= 0) return;
    const p: Printer = {
      id: printerForm.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: printerForm.name.trim(),
      power_w: wNum,
      wear_rate: Math.max(0, parseFloat(printerForm.wear_rate) || 0),
    };
    const updated = printerForm.id
      ? printers.map((pr) => (pr.id === printerForm.id ? p : pr))
      : [...printers, p];
    await invoke("save_printers", { rootPath: rootFolder, printers: updated });
    setPrinters(updated);
    setPrinterForm(null);
  };

  const handleDeletePrinter = async (id: string) => {
    if (!rootFolder) return;
    const updated = printers.filter((p) => p.id !== id);
    await invoke("save_printers", { rootPath: rootFolder, printers: updated });
    setPrinters(updated);
  };

  const handleSaveKwh = async () => {
    if (!rootFolder) return;
    const v = parseFloat(kwhInput);
    if (isNaN(v) || v < 0) return;
    await invoke("save_electricity_price", { rootPath: rootFolder, price: v });
    setElectricityPrice(v);
    setEditingKwh(false);
  };

  // ── Sessions d'impression ──

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
    setSelected(updated);
    setProjects((prev) => sortedInsert(prev, updated));
  };

  const handleSavePricing = () => {
    if (!selected) return;
    persistSessions(selected.sessions, selected.status, selected.quantity, {
      designTimeH: Math.max(0, parseFloat(designTimeInput) || 0),
      designRate: Math.max(0, parseFloat(designRateInput) || 0),
      sellingPrice: Math.max(0, parseFloat(sellingPriceInput) || 0),
    });
  };

  const handleChangeStatus = () => {
    if (!selected) return;
    const newStatus = selected.status === "done" ? "draft" : "done";
    persistSessions(selected.sessions, newStatus, selected.quantity);
  };

  const handleChangeQuantity = (delta: number) => {
    if (!selected) return;
    persistSessions(selected.sessions, selected.status, selected.quantity + delta);
  };

  const openNewSession = () => {
    setSessionForm({
      id: "",
      name: "",
      file_3mf: selected?.files_3mf[0] ?? "",
      printer_id: printers[0]?.id ?? "",
      print_time_h: "",
      consumables: [],
      labor_time_h: "",
      labor_rate: "",
    });
    setSessionConsPickId("");
    setSessionConsPickQty("");
  };

  const openEditSession = (s: PrintSession) => {
    setSessionForm({
      id: s.id,
      name: s.name,
      file_3mf: s.file_3mf,
      printer_id: s.printer_id,
      print_time_h: s.print_time_h.toString(),
      consumables: [...s.consumables],
      labor_time_h: s.labor_time_h > 0 ? s.labor_time_h.toString() : "",
      labor_rate: s.labor_rate > 0 ? s.labor_rate.toString() : "",
    });
    setSessionConsPickId("");
    setSessionConsPickQty("");
  };

  const addConsToSession = () => {
    if (!sessionForm || !sessionConsPickId) return;
    const qty = parseFloat(sessionConsPickQty);
    if (isNaN(qty) || qty <= 0) return;
    const existing = sessionForm.consumables.find((c) => c.consumable_id === sessionConsPickId);
    const updated = existing
      ? sessionForm.consumables.map((c) =>
          c.consumable_id === sessionConsPickId ? { ...c, quantity: c.quantity + qty } : c
        )
      : [...sessionForm.consumables, { consumable_id: sessionConsPickId, quantity: qty }];
    setSessionForm({ ...sessionForm, consumables: updated });
    setSessionConsPickId("");
    setSessionConsPickQty("");
  };

  const removeConsFromSession = (consumableId: string) => {
    if (!sessionForm) return;
    setSessionForm({
      ...sessionForm,
      consumables: sessionForm.consumables.filter((c) => c.consumable_id !== consumableId),
    });
  };

  const handleSaveSession = async () => {
    if (!selected || !sessionForm) return;
    const h = parseFloat(sessionForm.print_time_h);
    if (isNaN(h) || h <= 0) return;
    const session: PrintSession = {
      id: sessionForm.id || newSessionId(),
      name: sessionForm.name.trim(),
      file_3mf: sessionForm.file_3mf,
      printer_id: sessionForm.printer_id,
      print_time_h: h,
      consumables: sessionForm.consumables,
      labor_time_h: Math.max(0, parseFloat(sessionForm.labor_time_h) || 0),
      labor_rate: Math.max(0, parseFloat(sessionForm.labor_rate) || 0),
    };
    const sessions = sessionForm.id
      ? selected.sessions.map((s) => (s.id === session.id ? session : s))
      : [...selected.sessions, session];
    await persistSessions(sessions, selected.status, selected.quantity);
    setSessionForm(null);
  };

  const handleDeleteSession = async (id: string) => {
    if (!selected) return;
    await persistSessions(selected.sessions.filter((s) => s.id !== id), selected.status, selected.quantity);
  };

  // ── Archivage & outils ──

  const handleOpenWith = (filePath: string) => {
    if (!toolPath) return;
    invoke("open_with_tool", { filePath, toolPath }).catch((e) =>
      alert(`Erreur : ${e}`)
    );
  };

  const handleArchiveFile = (filePath: string) => {
    if (!selected) return;
    invoke<Project>("archive_file", { filePath })
      .then((updated) => {
        setSelected(updated);
        setProjects((prev) => sortedInsert(prev, updated));
      })
      .catch((e) => alert(`Erreur archivage : ${e}`));
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
    items.push({
      label: "Archiver",
      icon: "📦",
      onClick: () => handleArchiveFile(filePath),
    });
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

  // ── Calcul coût total d'une session ──
  const sessionCost = (s: PrintSession): { mat: number; elec: number; wear: number; labor: number } => {
    const mat = s.consumables.reduce((sum, sc) => {
      const c = consumables.find((x) => x.id === sc.consumable_id);
      return c ? sum + calcCost(c, sc.quantity) : sum;
    }, 0);
    const pr = printers.find((p) => p.id === s.printer_id);
    const elec = pr ? printerCost(pr, s.print_time_h, electricityPrice) : 0;
    const wear = pr ? (pr.wear_rate ?? 1) * s.print_time_h : 0;
    const labor = (s.labor_time_h ?? 0) * (s.labor_rate ?? 0);
    return { mat, elec, wear, labor };
  };

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
          <button
            className={`sidebar-nav-btn ${showConsumablesView ? "active" : ""}`}
            onClick={() => { setShowConsumablesView(true); setSelected(null); setConsForm(null); }}
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
              onClick={() => { setSelected(project); setShowConsumablesView(false); }}
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
        ) : showConsumablesView ? (
          /* ── Vue ressources globales ── */
          <div className="consumables-view">

            {/* Section Consommables */}
            <div className="global-section">
              <div className="consumables-header">
                <h2>Consommables</h2>
                <button className="btn-primary-sm" onClick={openBlankConsForm}>+ Nouveau</button>
              </div>
              {consForm && (
                <div className="cons-form">
                  <input className="cons-form-input" placeholder="Nom *" autoFocus
                    value={consForm.name} onChange={(e) => setConsForm({ ...consForm, name: e.target.value })} />
                  <input className="cons-form-input" placeholder="Catégorie (ex : Filament, Résine…)"
                    value={consForm.category} onChange={(e) => setConsForm({ ...consForm, category: e.target.value })} />
                  <select className="cons-form-select" value={consForm.price_mode}
                    onChange={(e) => setConsForm({ ...consForm, price_mode: e.target.value as PriceMode })}>
                    <option value="unit">À l'unité (€/unité)</option>
                    <option value="weight">Au poids (€/kg, quantité en g)</option>
                    <option value="volume">Au volume (€/L, quantité en ml)</option>
                  </select>
                  <div className="cons-form-price-row">
                    <input className="cons-form-input cons-form-price" type="number" min="0" step="0.001" placeholder="Prix *"
                      value={consForm.price} onChange={(e) => setConsForm({ ...consForm, price: e.target.value })} />
                    <span className="cons-form-unit">{priceUnitLabel({ ...consForm, price: 0, id: "" })}</span>
                  </div>
                  <div className="cons-form-actions">
                    <button className="btn-cancel" onClick={() => setConsForm(null)}>Annuler</button>
                    <button className="btn-save" onClick={handleSaveConsumable}
                      disabled={!consForm.name.trim() || !consForm.price || isNaN(parseFloat(consForm.price))}>
                      {consForm.id ? "Mettre à jour" : "Créer"}
                    </button>
                  </div>
                </div>
              )}
              {consumables.length === 0 && !consForm
                ? <p className="empty-files" style={{ padding: "16px 0" }}>Aucun consommable.</p>
                : <div className="cons-list">
                    {[...consumables]
                      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
                      .map((c) => (
                      <div key={c.id} className="cons-item">
                        <div className="cons-item-info">
                          <span className="cons-item-name">{c.name}</span>
                          {c.category && <span className="cons-item-category">{c.category}</span>}
                        </div>
                        <span className="cons-item-price">{c.price.toFixed(3)} {priceUnitLabel(c)}</span>
                        <div className="cons-item-actions">
                          <button className="btn-icon-sm" title="Modifier"
                            onClick={() => setConsForm({ ...c, price: c.price.toString() })}>✏</button>
                          <button className="btn-icon-sm btn-danger-icon" title="Supprimer"
                            onClick={() => handleDeleteConsumable(c.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>

            {/* Section Électricité */}
            <div className="global-section">
              <div className="consumables-header">
                <h2>⚡ Électricité</h2>
              </div>
              <div className="kwh-row">
                <span className="kwh-label">Prix du kWh</span>
                {editingKwh ? (
                  <>
                    <input className="kwh-input" type="number" min="0" step="0.0001" autoFocus
                      value={kwhInput} onChange={(e) => setKwhInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveKwh(); if (e.key === "Escape") setEditingKwh(false); }} />
                    <span className="kwh-unit">€/kWh</span>
                    <button className="btn-save" onClick={handleSaveKwh}>OK</button>
                    <button className="btn-cancel" onClick={() => setEditingKwh(false)}>Annuler</button>
                  </>
                ) : (
                  <>
                    <span className="kwh-value">{electricityPrice.toFixed(4)} €/kWh</span>
                    <button className="btn-icon-sm" title="Modifier"
                      onClick={() => { setKwhInput(electricityPrice.toString()); setEditingKwh(true); }}>✏</button>
                  </>
                )}
              </div>
            </div>

            {/* Section Imprimantes */}
            <div className="global-section">
              <div className="consumables-header">
                <h2>🖨 Imprimantes</h2>
                <button className="btn-primary-sm"
                  onClick={() => setPrinterForm({ id: "", name: "", power_w: "", wear_rate: "1" })}>+ Ajouter</button>
              </div>
              {printerForm && (
                <div className="cons-form">
                  <input className="cons-form-input" placeholder="Nom de l'imprimante *" autoFocus
                    value={printerForm.name} onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })} />
                  <div className="cons-form-price-row">
                    <input className="cons-form-input cons-form-price" type="number" min="0" step="1"
                      placeholder="Consommation *"
                      value={printerForm.power_w} onChange={(e) => setPrinterForm({ ...printerForm, power_w: e.target.value })} />
                    <span className="cons-form-unit">W</span>
                  </div>
                  <div className="cons-form-price-row">
                    <input className="cons-form-input cons-form-price" type="number" min="0" step="0.1"
                      placeholder="Usure *"
                      value={printerForm.wear_rate} onChange={(e) => setPrinterForm({ ...printerForm, wear_rate: e.target.value })} />
                    <span className="cons-form-unit">€/h (usure)</span>
                  </div>
                  <div className="cons-form-actions">
                    <button className="btn-cancel" onClick={() => setPrinterForm(null)}>Annuler</button>
                    <button className="btn-save" onClick={handleSavePrinter}
                      disabled={!printerForm.name.trim() || !printerForm.power_w || isNaN(parseFloat(printerForm.power_w))}>
                      {printerForm.id ? "Mettre à jour" : "Ajouter"}
                    </button>
                  </div>
                </div>
              )}
              {printers.length === 0 && !printerForm
                ? <p className="empty-files" style={{ padding: "16px 0" }}>Aucune imprimante configurée.</p>
                : <div className="cons-list">
                    {printers.map((p) => (
                      <div key={p.id} className="cons-item">
                        <div className="cons-item-info">
                          <span className="cons-item-name">{p.name}</span>
                          <span className="cons-item-category">Usure : {(p.wear_rate ?? 1).toFixed(2)} €/h</span>
                        </div>
                        <span className="cons-item-price">{p.power_w} W</span>
                        {electricityPrice > 0 && (
                          <span className="cons-item-kwh-hint">
                            {((p.power_w / 1000) * electricityPrice).toFixed(4)} €/h élec.
                          </span>
                        )}
                        <div className="cons-item-actions">
                          <button className="btn-icon-sm" title="Modifier"
                            onClick={() => setPrinterForm({ ...p, power_w: p.power_w.toString(), wear_rate: (p.wear_rate ?? 1).toString() })}>✏</button>
                          <button className="btn-icon-sm btn-danger-icon" title="Supprimer"
                            onClick={() => handleDeletePrinter(p.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          </div>

        ) : !selected ? (
          <div className="empty-state">
            <div className="empty-icon">🖨️</div>
            <p>Sélectionne un projet dans la liste.</p>
          </div>
        ) : (
          /* ── Vue projet ── */
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

            {/* Header pleine largeur */}
            <div className="project-header">
              {renaming ? (
                <div className="rename-form">
                  <input className="rename-input" value={renameValue}
                    onChange={(e) => { setRenameValue(e.target.value); setRenameError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
                    placeholder="Nom du projet" autoFocus />
                  <div className="rename-hint">Dossier : <code>{renameValue.trim() ? toCamelCasePreview(renameValue) : "…"}</code></div>
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
                    <button className={`status-badge ${selected.status === "done" ? "status-done" : "status-draft"}`}
                      onClick={handleChangeStatus} title="Cliquer pour changer le statut">
                      {selected.status === "done" ? "✓ Terminé" : "✏ Brouillon"}
                    </button>
                    <button className="btn-rename" onClick={() => { setRenameValue(displayName(selected)); setRenameError(null); setRenaming(true); }}>
                      ✏️ Renommer
                    </button>
                  </div>
                </div>
              )}
              <div className="tags-row">
                {selected.tags.map((tag) => {
                  const { bg, text } = tagColor(tag);
                  return (
                    <span key={tag} className="tag-chip" style={{ background: bg, color: text }}
                      onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)} title="Cliquer pour filtrer">
                      {tag}
                      <button className="tag-remove" style={{ color: text }}
                        onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}>×</button>
                    </span>
                  );
                })}
                {addingTag ? (
                  <input className="tag-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(); if (e.key === "Escape") { setAddingTag(false); setTagInput(""); } }}
                    onBlur={handleAddTag} placeholder="Nouveau tag…" autoFocus maxLength={32} />
                ) : (
                  <button className="tag-add-btn" onClick={() => setAddingTag(true)}>+ Tag</button>
                )}
              </div>
            </div>

            {/* Corps : récapitulatif en haut + onglets */}
            <div className="project-body">

              {/* Barre récapitulative */}
              <div className="summary-bar">
                <div className="summary-sessions-scroll">
                  {selected.sessions.length === 0 ? (
                    <span className="summary-empty">Aucune session d'impression configurée</span>
                  ) : selected.sessions.map((s, idx) => {
                    const { mat, elec, wear, labor } = sessionCost(s);
                    const total = mat + elec + wear + labor;
                    const b64 = thumbnails[s.file_3mf];
                    return (
                      <div key={s.id} className="summary-mini-card">
                        {b64
                          ? <img src={`data:image/png;base64,${b64}`} className="summary-mini-thumb" alt={s.file_3mf} />
                          : <div className="summary-mini-thumb summary-mini-thumb-ph">📦</div>
                        }
                        <div className="summary-mini-info">
                          <span className="summary-mini-name">
                            <span className="cost-summary-index">#{idx + 1}</span>
                            {" "}{s.name || s.file_3mf || "Session"}
                          </span>
                          {total > 0 && <span className="summary-mini-cost">{total.toFixed(2)} €</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="summary-totals-panel">
                  {(() => {
                    const grand = selected.sessions.reduce((acc, s) => {
                      const { mat, elec, wear, labor } = sessionCost(s);
                      return { mat: acc.mat + mat, elec: acc.elec + elec, wear: acc.wear + wear, labor: acc.labor + labor };
                    }, { mat: 0, elec: 0, wear: 0, labor: 0 });
                    const prodTotal = grand.mat + grand.elec + grand.wear + grand.labor;
                    const costPerUnit = selected.quantity > 0 ? prodTotal / selected.quantity : 0;
                    const designCost = selected.design_time_h * selected.design_rate;
                    const hasSelling = selected.selling_price > 0;
                    const marginPerUnit = hasSelling ? selected.selling_price - costPerUnit : null;
                    const breakEven = designCost > 0 && marginPerUnit !== null && marginPerUnit > 0
                      ? Math.ceil(designCost / marginPerUnit) : null;
                    return (
                      <>
                        {prodTotal > 0 ? (
                          <>
                            <div className="summary-total-line">
                              <span>Production</span>
                              <span className="summary-val-blue">{prodTotal.toFixed(2)} €</span>
                            </div>
                            {selected.quantity > 1 && (
                              <div className="summary-total-line summary-line-muted">
                                <span>Par objet (×{selected.quantity})</span>
                                <span>{costPerUnit.toFixed(2)} €</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="summary-empty">Pas de coût configuré</span>
                        )}
                        {hasSelling && (
                          <>
                            <div className="summary-divider" />
                            <div className="summary-total-line">
                              <span>Prix de vente</span>
                              <span className="summary-val-blue">{selected.selling_price.toFixed(2)} €</span>
                            </div>
                            {prodTotal > 0 && marginPerUnit !== null && (
                              <div className={`summary-total-line ${marginPerUnit >= 0 ? "summary-val-green" : "summary-val-red"}`}>
                                <span>Marge/objet</span>
                                <span>{marginPerUnit >= 0 ? "+" : ""}{marginPerUnit.toFixed(2)} €</span>
                              </div>
                            )}
                          </>
                        )}
                        {designCost > 0 && (
                          <>
                            <div className="summary-divider" />
                            <div className="summary-total-line summary-line-muted">
                              <span>Conception ({selected.design_time_h} h)</span>
                              <span>{designCost.toFixed(2)} €</span>
                            </div>
                            {breakEven !== null && (
                              <div className="summary-breakeven">
                                Rentable en <strong>{breakEven}</strong> vente{breakEven > 1 ? "s" : ""}
                              </div>
                            )}
                            {marginPerUnit !== null && marginPerUnit <= 0 && (
                              <div className="summary-breakeven summary-breakeven-warn">Marge insuffisante</div>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Panneau principal : onglets */}
              <div className="project-main-panel">

                {editorOpen ? (
                  /* Éditeur markdown inline dans la colonne droite */
                  <div className="editor-wrap">
                    <div className="editor-header">
                      <span className="editor-title">{displayName(selected)} — <code>main.md</code></span>
                      <div className="editor-tabs">
                        <button className={`editor-tab ${editorTab === "edit" ? "active" : ""}`} onClick={() => setEditorTab("edit")}>Éditer</button>
                        <button className={`editor-tab ${editorTab === "preview" ? "active" : ""}`} onClick={() => setEditorTab("preview")}>Aperçu</button>
                      </div>
                      <div className="editor-actions">
                        {saveError && <span className="save-error">{saveError}</span>}
                        <button className="btn-cancel" onClick={() => setEditorOpen(false)} disabled={saving}>Annuler</button>
                        <button className="btn-save" onClick={handleSave} disabled={saving}>{saving ? "Sauvegarde…" : "Sauvegarder"}</button>
                      </div>
                    </div>
                    {editorTab === "edit" ? (
                      <textarea className="editor-textarea" value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        placeholder="Décris ton projet ici (Markdown supporté)…" spellCheck={false} autoFocus />
                    ) : (
                      <div className="editor-preview">
                        {editorContent.trim()
                          ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{editorContent}</ReactMarkdown></div>
                          : <p className="empty-files">Rien à prévisualiser.</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Barre d'onglets */}
                    <div className="main-tabs">
                      <button className={`main-tab-btn ${rightTab === "description" ? "active" : ""}`} onClick={() => setRightTab("description")}>
                        📝 Description
                      </button>
                      <button className={`main-tab-btn ${rightTab === "sessions" ? "active" : ""}`} onClick={() => setRightTab("sessions")}>
                        🗓 Sessions
                        {selected.sessions.length > 0 && <span className="main-tab-count">{selected.sessions.length}</span>}
                      </button>
                      <button className={`main-tab-btn ${rightTab === "config" ? "active" : ""}`} onClick={() => setRightTab("config")}>
                        ⚙️ Configuration
                      </button>
                      <button className={`main-tab-btn ${rightTab === "files" ? "active" : ""}`} onClick={() => setRightTab("files")}>
                        📁 Fichiers
                        {totalFiles > 0 && <span className="main-tab-count">{totalFiles}</span>}
                      </button>
                    </div>

                    {/* Contenu des onglets */}
                    <div className="tab-content">

                      {/* ── Description ── */}
                      {rightTab === "description" && (
                        <section className="detail-section">
                          <div className="section-header-row">
                            <h2>Description (main.md)</h2>
                            <button className="btn-edit" onClick={() => {
                              setEditorContent(selected.markdown_content ?? "");
                              setEditorTab("edit");
                              setSaveError(null);
                              setEditorOpen(true);
                            }}>
                              {selected.markdown_content ? "✏️ Modifier" : "✏️ Créer"}
                            </button>
                          </div>
                          {selected.markdown_content ? (
                            <div className="markdown-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.markdown_content}</ReactMarkdown>
                            </div>
                          ) : (
                            <p className="empty-files">Aucun fichier main.md — clique sur "Créer" pour en rédiger un.</p>
                          )}
                        </section>
                      )}

                      {/* ── Sessions ── */}
                      {rightTab === "sessions" && (
                        <section className="detail-section">
                          <div className="section-header-row">
                            <h2>Sessions d'impression</h2>
                            {!sessionForm && <button className="btn-primary-sm" onClick={openNewSession}>+ Nouvelle session</button>}
                          </div>

                          {sessionForm && (
                            <div className="session-form">
                              <div className="session-form-row">
                                <label>Nom</label>
                                <input className="cons-form-input" placeholder="ex : Plateau principal…"
                                  value={sessionForm.name} onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })} />
                              </div>
                              <div className="session-form-row">
                                <label>Fichier 3MF</label>
                                {selected.files_3mf.length > 0 ? (
                                  <select className="cons-form-select" value={sessionForm.file_3mf}
                                    onChange={(e) => setSessionForm({ ...sessionForm, file_3mf: e.target.value })}>
                                    {selected.files_3mf.map((f) => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                ) : (
                                  <input className="cons-form-input" placeholder="nom-du-fichier.3mf"
                                    value={sessionForm.file_3mf} onChange={(e) => setSessionForm({ ...sessionForm, file_3mf: e.target.value })} />
                                )}
                              </div>
                              <div className="session-form-row">
                                <label>Imprimante</label>
                                {printers.length > 0 ? (
                                  <select className="cons-form-select" value={sessionForm.printer_id}
                                    onChange={(e) => setSessionForm({ ...sessionForm, printer_id: e.target.value })}>
                                    {printers.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.power_w} W</option>)}
                                  </select>
                                ) : (
                                  <span className="session-form-hint">Aucune imprimante — configure-en dans Consommables</span>
                                )}
                              </div>
                              <div className="session-form-row">
                                <label>Durée</label>
                                <div className="cons-form-price-row">
                                  <input className="cons-form-input cons-form-price" type="number" min="0" step="0.01" placeholder="0.00"
                                    value={sessionForm.print_time_h} onChange={(e) => setSessionForm({ ...sessionForm, print_time_h: e.target.value })} />
                                  <span className="cons-form-unit">h</span>
                                </div>
                              </div>
                              <div className="session-form-cons-section">
                                <span className="session-form-cons-label">Consommables</span>
                                {sessionForm.consumables.length > 0 && (
                                  <div className="session-form-cons-list">
                                    {sessionForm.consumables.map((sc) => {
                                      const c = consumables.find((x) => x.id === sc.consumable_id);
                                      return (
                                        <div key={sc.consumable_id} className="session-form-cons-row">
                                          <span className="session-form-cons-name">{c?.name ?? "?"}</span>
                                          <span className="session-form-cons-qty">{sc.quantity} {c ? unitLabel(c) : ""}</span>
                                          <button className="btn-icon-sm btn-danger-icon" onClick={() => removeConsFromSession(sc.consumable_id)}>🗑</button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {consumables.length > 0 && (
                                  <div className="cost-add-form">
                                    <select className="cost-add-select" value={sessionConsPickId} onChange={(e) => setSessionConsPickId(e.target.value)}>
                                      <option value="">+ Ajouter un consommable…</option>
                                      {[...consumables].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)).map((c) => (
                                        <option key={c.id} value={c.id}>{c.category ? `[${c.category}] ` : ""}{c.name}</option>
                                      ))}
                                    </select>
                                    <input className="cost-add-qty" type="number" min="0" step="any" placeholder="Qté"
                                      value={sessionConsPickQty} onChange={(e) => setSessionConsPickQty(e.target.value)} />
                                    {sessionConsPickId && <span className="cost-add-unit">{unitLabel(consumables.find((c) => c.id === sessionConsPickId)!)}</span>}
                                    <button className="btn-save" onClick={addConsToSession}
                                      disabled={!sessionConsPickId || !sessionConsPickQty || parseFloat(sessionConsPickQty) <= 0}>Ajouter</button>
                                  </div>
                                )}
                              </div>
                              <div className="session-form-cons-section">
                                <span className="session-form-cons-label">Main d'œuvre</span>
                                <div className="session-form-row">
                                  <label>Temps</label>
                                  <div className="cons-form-price-row">
                                    <input className="cons-form-input cons-form-price" type="number" min="0" step="0.5" placeholder="0"
                                      value={sessionForm.labor_time_h}
                                      onChange={(e) => setSessionForm({ ...sessionForm, labor_time_h: e.target.value })} />
                                    <span className="cons-form-unit">h</span>
                                  </div>
                                </div>
                                <div className="session-form-row">
                                  <label>Taux horaire</label>
                                  <div className="cons-form-price-row">
                                    <input className="cons-form-input cons-form-price" type="number" min="0" step="1" placeholder="0"
                                      value={sessionForm.labor_rate}
                                      onChange={(e) => setSessionForm({ ...sessionForm, labor_rate: e.target.value })} />
                                    <span className="cons-form-unit">€/h</span>
                                  </div>
                                </div>
                                {parseFloat(sessionForm.labor_time_h) > 0 && parseFloat(sessionForm.labor_rate) > 0 && (
                                  <div className="session-form-hint">
                                    Coût MO : {(parseFloat(sessionForm.labor_time_h) * parseFloat(sessionForm.labor_rate)).toFixed(2)} €
                                  </div>
                                )}
                              </div>
                              <div className="cons-form-actions">
                                <button className="btn-cancel" onClick={() => setSessionForm(null)}>Annuler</button>
                                <button className="btn-save" onClick={handleSaveSession}
                                  disabled={!sessionForm.print_time_h || parseFloat(sessionForm.print_time_h) <= 0}>
                                  {sessionForm.id ? "Mettre à jour" : "Créer la session"}
                                </button>
                              </div>
                            </div>
                          )}

                          {selected.sessions.length === 0 && !sessionForm ? (
                            <p className="empty-files">Aucune session d'impression enregistrée.</p>
                          ) : (
                            <div className="session-list">
                              {selected.sessions.map((s, idx) => {
                                const pr = printers.find((p) => p.id === s.printer_id);
                                const { mat, elec, wear, labor } = sessionCost(s);
                                const thumb = thumbnails[s.file_3mf];
                                return (
                                  <div key={s.id} className="session-card">
                                    <div className="session-card-header">
                                      {thumb && <img src={`data:image/png;base64,${thumb}`} className="session-card-thumb" alt={s.file_3mf} />}
                                      <div className="session-card-title">
                                        <span className="session-card-index">#{idx + 1}</span>
                                        <span className="session-card-name">{s.name || s.file_3mf || "Session sans nom"}</span>
                                      </div>
                                      <div className="session-card-actions">
                                        <button className="btn-icon-sm" title="Modifier" onClick={() => openEditSession(s)}>✏</button>
                                        <button className="btn-icon-sm btn-danger-icon" title="Supprimer" onClick={() => handleDeleteSession(s.id)}>🗑</button>
                                      </div>
                                    </div>
                                    <div className="session-card-meta">
                                      {s.file_3mf && <span className="session-meta-chip">📦 {s.file_3mf}</span>}
                                      {pr && <span className="session-meta-chip">🖨 {pr.name}</span>}
                                      <span className="session-meta-chip">⏱ {s.print_time_h} h</span>
                                    </div>
                                    {s.consumables.length > 0 && (
                                      <div className="session-cons-list">
                                        {s.consumables.map((sc) => {
                                          const c = consumables.find((x) => x.id === sc.consumable_id);
                                          return (
                                            <span key={sc.consumable_id} className="session-cons-chip">
                                              {c?.name ?? "?"} × {sc.quantity}{c ? ` ${unitLabel(c)}` : ""}
                                              {c ? ` — ${calcCost(c, sc.quantity).toFixed(2)} €` : ""}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {(mat > 0 || elec > 0 || wear > 0 || labor > 0) && (
                                      <div className="session-card-cost">
                                        {mat > 0 && <span>Matière : {mat.toFixed(2)} €</span>}
                                        {elec > 0 && <span>Électricité : {elec.toFixed(3)} €</span>}
                                        {wear > 0 && <span>Usure : {wear.toFixed(2)} €</span>}
                                        {labor > 0 && <span>MO : {labor.toFixed(2)} €</span>}
                                        <span className="session-card-total">Total : {(mat + elec + wear + labor).toFixed(2)} €</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      )}

                      {/* ── Configuration ── */}
                      {rightTab === "config" && (
                        <div>
                          <section className="detail-section">
                            <h2>Production</h2>
                            <div className="config-row">
                              <div className="config-row-info">
                                <span className="config-row-label">Quantité produite</span>
                                <span className="config-row-hint">Nombre d'objets fabriqués par ce projet</span>
                              </div>
                              <div className="cost-summary-qty-ctrl">
                                <button className="qty-btn" onClick={() => handleChangeQuantity(-1)} disabled={selected.quantity <= 1}>−</button>
                                <span className="qty-val">{selected.quantity}</span>
                                <button className="qty-btn" onClick={() => handleChangeQuantity(1)}>+</button>
                              </div>
                            </div>
                          </section>
                          <section className="detail-section">
                            <h2>Tarification</h2>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <div className="config-row">
                                <div className="config-row-info">
                                  <span className="config-row-label">Prix de vente</span>
                                  <span className="config-row-hint">Prix de vente d'un objet au client</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input type="number" min="0" step="0.5" className="cost-add-qty" placeholder="0"
                                    value={sellingPriceInput}
                                    onChange={(e) => setSellingPriceInput(e.target.value)}
                                    onBlur={handleSavePricing}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSavePricing(); }} />
                                  <span className="cost-add-unit">€</span>
                                </div>
                              </div>
                              <div className="summary-divider" style={{ margin: "4px 0" }} />
                              <div className="config-row">
                                <div className="config-row-info">
                                  <span className="config-row-label">Temps de conception</span>
                                  <span className="config-row-hint">Heures de design (Fusion 360, modélisation…)</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input type="number" min="0" step="0.5" className="cost-add-qty" placeholder="0"
                                    value={designTimeInput}
                                    onChange={(e) => setDesignTimeInput(e.target.value)}
                                    onBlur={handleSavePricing}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSavePricing(); }} />
                                  <span className="cost-add-unit">h</span>
                                </div>
                              </div>
                              <div className="config-row">
                                <div className="config-row-info">
                                  <span className="config-row-label">Taux horaire conception</span>
                                  <span className="config-row-hint">Coût de votre heure de design</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input type="number" min="0" step="1" className="cost-add-qty" placeholder="0"
                                    value={designRateInput}
                                    onChange={(e) => setDesignRateInput(e.target.value)}
                                    onBlur={handleSavePricing}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSavePricing(); }} />
                                  <span className="cost-add-unit">€/h</span>
                                </div>
                              </div>
                            </div>
                          </section>
                        </div>
                      )}

                      {/* ── Fichiers ── */}
                      {rightTab === "files" && (
                        <div>
                          {(selected.files_3mf.length > 0 || selected.stl_files.length > 0) && (
                            <section className="detail-section">
                              <h2>Fichiers d'impression</h2>
                              <div className="thumb-grid">
                                {selected.files_3mf.map((file) => {
                                  const b64 = thumbnails[file];
                                  const isLoading = !(file in thumbnails);
                                  const info = printInfoMap[file];
                                  const hasInfo = info && (info.print_time !== null || info.weight_g !== null);
                                  return (
                                    <div key={file} className="thumb-card"
                                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, filePath: `${selected.path}\\${file}` }); }}>
                                      <div className="thumb-img-wrap">
                                        {isLoading ? <div className="thumb-placeholder loading">⏳</div>
                                          : b64 ? <img src={`data:image/png;base64,${b64}`} alt={file} className="thumb-img" />
                                          : <div className="thumb-placeholder">📦</div>}
                                      </div>
                                      <span className="thumb-type-badge">3MF</span>
                                      <span className="thumb-label" title={file}>{file}</span>
                                      {hasInfo && (
                                        <div className="thumb-print-info">
                                          {info.print_time && <span className="thumb-print-stat">⏱ {info.print_time}</span>}
                                          {info.weight_g !== null && <span className="thumb-print-stat">⚖ {info.weight_g!.toFixed(1)} g</span>}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {selected.stl_files.map((file) => {
                                  const data = stlData[file];
                                  const isLoading = !(file in stlData);
                                  return (
                                    <div key={file} className="thumb-card"
                                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, filePath: `${selected.path}\\${file}` }); }}>
                                      <div className="thumb-img-wrap">
                                        {isLoading ? <div className="thumb-placeholder loading">⏳</div>
                                          : data ? <StlViewer base64={data} />
                                          : <div className="thumb-placeholder">📐</div>}
                                      </div>
                                      <span className="thumb-type-badge thumb-type-stl">STL</span>
                                      <span className="thumb-label" title={file}>{file}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          )}
                          {selected.f3d_files.length > 0 && (
                            <section className="detail-section">
                              <h2>Fusion 360</h2>
                              <ul className="file-list">
                                {selected.f3d_files.map((file) => (
                                  <li key={file} className="file-item"><span className="file-icon">📐</span>{file}</li>
                                ))}
                              </ul>
                            </section>
                          )}
                          {selected.mp4_files.length > 0 && (
                            <section className="detail-section">
                              <h2>Timelapses</h2>
                              <div className="video-grid">
                                {selected.mp4_files.map((file) => {
                                  const src = convertFileSrc(`${selected.path}\\${file}`);
                                  return (
                                    <button key={file} className="video-card" onClick={() => setVideoModal({ src, name: file })}>
                                      <video src={src} className="video-thumb" muted preload="metadata" />
                                      <div className="video-card-overlay"><span className="video-play-icon">▶</span></div>
                                      <span className="video-label" title={file}>{file}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          )}
                          {totalFiles === 0 && (
                            <div className="drop-hint" style={{ margin: "16px 0" }}>
                              <span>📥</span>
                              <p>Glisse tes fichiers .3mf ou .f3d ici pour les ajouter au projet.</p>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </>
                )}
              </div>
            </div>
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
