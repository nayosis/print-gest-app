use std::fs;
use std::io::Read;
use std::path::Path;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct Consumable {
    pub id: String,
    pub name: String,
    pub category: String,
    pub price_mode: String,  // "unit" | "weight" | "volume"
    pub price: f64,
}

fn default_wear_rate() -> f64 { 1.0 }

#[derive(Serialize, Deserialize, Clone)]
pub struct Printer {
    pub id: String,
    pub name: String,
    pub power_w: f64,
    #[serde(default = "default_wear_rate")]
    pub wear_rate: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionConsumable {
    pub consumable_id: String,
    pub quantity: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PrintSession {
    pub id: String,
    pub name: String,
    pub file_3mf: String,
    pub printer_id: String,
    pub print_time_h: f64,
    pub consumables: Vec<SessionConsumable>,
    #[serde(default)]
    pub labor_time_h: f64,
    #[serde(default)]
    pub labor_rate: f64,
}

#[derive(Serialize, Deserialize)]
pub struct Project {
    pub name: String,
    pub title: Option<String>,
    pub tags: Vec<String>,
    pub path: String,
    pub f3d_files: Vec<String>,
    pub files_3mf: Vec<String>,
    pub stl_files: Vec<String>,
    pub mp4_files: Vec<String>,
    pub markdown_content: Option<String>,
    pub status: String,
    pub sessions: Vec<PrintSession>,
    pub quantity: u32,
    pub design_time_h: f64,
    pub design_rate: f64,
    pub selling_price: f64,
}

// ── Tree ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct FolderNode {
    pub name: String,
    pub path: String,
    /// Some → projet, None → dossier groupe
    pub project: Option<Project>,
    pub children: Vec<FolderNode>,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

struct Meta {
    title: Option<String>,
    tags: Vec<String>,
    status: String,
    sessions: Vec<PrintSession>,
    quantity: u32,
    design_time_h: f64,
    design_rate: f64,
    selling_price: f64,
}

fn read_meta(dir: &Path) -> Meta {
    let empty = Meta { title: None, tags: Vec::new(), status: "draft".into(), sessions: Vec::new(), quantity: 1, design_time_h: 0.0, design_rate: 0.0, selling_price: 0.0 };
    let Ok(content) = fs::read_to_string(dir.join("meta.json")) else { return empty };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) else { return empty };
    let title = v["title"].as_str().map(|s| s.to_string());
    let tags = v["tags"].as_array()
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let status = v["status"].as_str().unwrap_or("draft").to_string();
    let sessions = v["sessions"].as_array()
        .map(|arr| arr.iter().filter_map(|i| serde_json::from_value::<PrintSession>(i.clone()).ok()).collect())
        .unwrap_or_default();
    let quantity = v["quantity"].as_u64().unwrap_or(1).max(1) as u32;
    let design_time_h = v["design_time_h"].as_f64().unwrap_or(0.0).max(0.0);
    let design_rate = v["design_rate"].as_f64().unwrap_or(0.0).max(0.0);
    let selling_price = v["selling_price"].as_f64().unwrap_or(0.0).max(0.0);
    Meta { title, tags, status, sessions, quantity, design_time_h, design_rate, selling_price }
}

fn to_camel_case(s: &str) -> String {
    let mut words = s.split_whitespace();
    let first = words.next().unwrap_or("").to_lowercase();
    let rest: String = words
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(c) => c.to_uppercase().to_string() + chars.as_str(),
            }
        })
        .collect();
    first + &rest
}

fn is_project_dir(path: &Path) -> bool {
    if path.join("meta.json").exists() { return true; }
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                match p.extension().and_then(|e| e.to_str()) {
                    Some("f3d" | "3mf" | "stl" | "STL" | "mp4") => return true,
                    _ => {}
                }
            }
        }
    }
    false
}

fn scan_tree(path: &Path) -> FolderNode {
    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let path_str = path.to_string_lossy().to_string();

    if is_project_dir(path) {
        return FolderNode {
            name,
            path: path_str,
            project: Some(scan_project_dir(path)),
            children: vec![],
        };
    }

    let mut children: Vec<FolderNode> = fs::read_dir(path)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            let p = e.path();
            if !p.is_dir() { return false; }
            let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            n != "_meta" && !n.starts_with('.')
        })
        .map(|e| scan_tree(&e.path()))
        .collect();

    children.sort_by(|a, b| {
        let a_folder = a.project.is_none();
        let b_folder = b.project.is_none();
        b_folder.cmp(&a_folder).then_with(|| {
            let a_name = a.project.as_ref()
                .map(|p| p.title.as_deref().unwrap_or(&p.name))
                .unwrap_or(&a.name)
                .to_lowercase();
            let b_name = b.project.as_ref()
                .map(|p| p.title.as_deref().unwrap_or(&p.name))
                .unwrap_or(&b.name)
                .to_lowercase();
            a_name.cmp(&b_name)
        })
    });

    FolderNode { name, path: path_str, project: None, children }
}

fn scan_project_dir(path: &Path) -> Project {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let meta = read_meta(path);
    let mut f3d_files = Vec::new();
    let mut files_3mf = Vec::new();
    let mut stl_files = Vec::new();
    let mut mp4_files = Vec::new();
    let mut markdown_content = None;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let sub = entry.path();
            match sub.extension().and_then(|e| e.to_str()) {
                Some("f3d") => {
                    if let Some(f) = sub.file_name() {
                        f3d_files.push(f.to_string_lossy().to_string());
                    }
                }
                Some("3mf") => {
                    if let Some(f) = sub.file_name() {
                        files_3mf.push(f.to_string_lossy().to_string());
                    }
                }
                Some("stl") | Some("STL") => {
                    if let Some(f) = sub.file_name() {
                        stl_files.push(f.to_string_lossy().to_string());
                    }
                }
                Some("mp4") | Some("MP4") | Some("mov") | Some("MOV") => {
                    if let Some(f) = sub.file_name() {
                        mp4_files.push(f.to_string_lossy().to_string());
                    }
                }
                Some("md")
                    if sub.file_name().and_then(|f| f.to_str()) == Some("main.md") =>
                {
                    markdown_content = fs::read_to_string(&sub).ok();
                }
                _ => {}
            }
        }
    }

    f3d_files.sort();
    files_3mf.sort();
    stl_files.sort();
    mp4_files.sort();

    Project {
        name,
        title: meta.title,
        tags: meta.tags,
        path: path.to_string_lossy().to_string(),
        f3d_files,
        files_3mf,
        stl_files,
        mp4_files,
        markdown_content,
        status: meta.status,
        sessions: meta.sessions,
        quantity: meta.quantity,
        design_time_h: meta.design_time_h,
        design_rate: meta.design_rate,
        selling_price: meta.selling_price,
    }
}

fn read_meta_json(project_path: &Path) -> serde_json::Value {
    fs::read_to_string(project_path.join("meta.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}))
}

fn write_meta(project_path: &Path, title: &str) -> Result<(), String> {
    // Préserve les champs existants (tags, etc.) en lisant d'abord le fichier
    let mut meta = read_meta_json(project_path);
    meta["title"] = serde_json::json!(title);
    fs::write(
        project_path.join("meta.json"),
        serde_json::to_string_pretty(&meta).unwrap(),
    )
    .map_err(|e| format!("Erreur écriture meta.json : {}", e))
}

#[tauri::command]
fn save_tags(project_path: String, tags: Vec<String>) -> Result<(), String> {
    let path = Path::new(&project_path);
    let mut meta = read_meta_json(path);
    meta["tags"] = serde_json::json!(tags);
    fs::write(
        path.join("meta.json"),
        serde_json::to_string_pretty(&meta).unwrap(),
    )
    .map_err(|e| e.to_string())
}

// ── Commandes ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn scan_folder_tree(folder_path: String) -> Result<FolderNode, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Dossier introuvable : {}", folder_path));
    }
    Ok(scan_tree(path))
}

#[tauri::command]
fn create_folder(parent_path: String, name: String) -> Result<FolderNode, String> {
    let name = name.trim().to_string();
    if name.is_empty() { return Err("Le nom ne peut pas être vide.".into()); }
    let path = Path::new(&parent_path).join(&name);
    if path.exists() { return Err(format!("'{}' existe déjà.", name)); }
    fs::create_dir_all(&path).map_err(|e| format!("Erreur création : {}", e))?;
    Ok(scan_tree(&path))
}

#[tauri::command]
fn rename_folder(path: String, new_name: String) -> Result<String, String> {
    let new_name = new_name.trim().to_string();
    if new_name.is_empty() { return Err("Le nom ne peut pas être vide.".into()); }
    let old = Path::new(&path);
    let parent = old.parent().ok_or("Impossible de trouver le dossier parent.")?;
    let new_path = parent.join(&new_name);
    if new_path.exists() {
        return Err(format!("'{}' existe déjà.", new_name));
    }
    fs::rename(old, &new_path).map_err(|e| format!("Erreur renommage : {}", e))?;
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
fn move_item(from_path: String, to_parent_path: String) -> Result<String, String> {
    let from = Path::new(&from_path);
    let to_parent = Path::new(&to_parent_path);
    if to_parent.starts_with(from) {
        return Err("Impossible de déplacer un dossier dans lui-même.".into());
    }
    let name = from.file_name().ok_or("Nom invalide")?;
    let dest = to_parent.join(name);
    if dest.exists() {
        return Err(format!("'{}' existe déjà dans la destination.", name.to_string_lossy()));
    }
    fs::rename(from, &dest).map_err(|e| format!("Erreur déplacement : {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn scan_projects(folder_path: String) -> Result<Vec<Project>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Dossier introuvable : {}", folder_path));
    }

    let mut projects: Vec<Project> = fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|e| {
            let p = e.path();
            p.is_dir() && p.file_name().and_then(|n| n.to_str()) != Some("_meta")
        })
        .map(|e| scan_project_dir(&e.path()))
        .collect();

    projects.sort_by(|a, b| {
        let la = a.title.as_deref().unwrap_or(&a.name).to_lowercase();
        let lb = b.title.as_deref().unwrap_or(&b.name).to_lowercase();
        la.cmp(&lb)
    });

    Ok(projects)
}

#[tauri::command]
fn refresh_project(project_path: String) -> Result<Project, String> {
    let path = Path::new(&project_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Dossier introuvable : {}", project_path));
    }
    Ok(scan_project_dir(path))
}

#[tauri::command]
fn create_project(root_path: String, title: String) -> Result<Project, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Le titre ne peut pas être vide.".into());
    }

    let folder_name = to_camel_case(&title);
    let project_path = Path::new(&root_path).join(&folder_name);

    if project_path.exists() {
        return Err(format!("Un dossier '{}' existe déjà.", folder_name));
    }

    fs::create_dir(&project_path)
        .map_err(|e| format!("Erreur création dossier : {}", e))?;

    write_meta(&project_path, &title)?;

    Ok(scan_project_dir(&project_path))
}

#[tauri::command]
fn rename_project(project_path: String, new_title: String) -> Result<Project, String> {
    let new_title = new_title.trim().to_string();
    if new_title.is_empty() {
        return Err("Le titre ne peut pas être vide.".into());
    }

    let path = Path::new(&project_path);
    let parent = path
        .parent()
        .ok_or("Impossible de trouver le dossier parent.")?;

    let new_folder_name = to_camel_case(&new_title);
    let new_path = parent.join(&new_folder_name);

    if new_path != path {
        if new_path.exists() {
            return Err(format!("Un dossier '{}' existe déjà.", new_folder_name));
        }
        fs::rename(path, &new_path)
            .map_err(|e| format!("Erreur renommage : {}", e))?;
    }

    write_meta(&new_path, &new_title)?;

    Ok(scan_project_dir(&new_path))
}

#[tauri::command]
fn copy_files_to_project(project_path: String, file_paths: Vec<String>) -> Result<Project, String> {
    let dest_dir = Path::new(&project_path);

    for src_str in &file_paths {
        let src = Path::new(src_str);
        if !src.is_file() {
            continue;
        }
        let file_name = src
            .file_name()
            .ok_or_else(|| format!("Nom invalide : {}", src_str))?;
        fs::copy(src, dest_dir.join(file_name))
            .map_err(|e| format!("Erreur copie {} : {}", src_str, e))?;
    }

    Ok(scan_project_dir(dest_dir))
}

#[tauri::command]
fn save_markdown(project_path: String, content: String) -> Result<(), String> {
    fs::write(Path::new(&project_path).join("main.md"), content.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_with_tool(file_path: String, tool_path: String) -> Result<(), String> {
    // CreateProcess direct est bloqué par Windows Smart App Control / WDAC.
    // Start-Process utilise ShellExecuteW (même mécanisme qu'un double-clic),
    // ce qui est accepté par toutes les politiques de contrôle d'application.
    let cmd = format!(
        "Start-Process -FilePath '{}' -ArgumentList '{}'",
        tool_path.replace('\'', "''"),
        file_path.replace('\'', "''"),
    );
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &cmd])
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Impossible de lancer PowerShell : {}", e))
}

// Lecture binaire d'un fichier (pour le rendu STL côté frontend).
// Limite à 50 Mo pour éviter de saturer la mémoire.
#[tauri::command]
fn read_file_base64(file_path: String) -> Result<Option<String>, String> {
    let meta = fs::metadata(&file_path).map_err(|e| e.to_string())?;
    if meta.len() > 50 * 1024 * 1024 {
        return Ok(None);
    }
    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;
    Ok(Some(general_purpose::STANDARD.encode(&bytes)))
}

// ── Consommables ──────────────────────────────────────────────────────────────

fn consumables_path(root: &Path) -> std::path::PathBuf {
    root.join("_meta").join("consumables.json")
}
fn printers_path(root: &Path) -> std::path::PathBuf {
    root.join("_meta").join("printers.json")
}
fn settings_path(root: &Path) -> std::path::PathBuf {
    root.join("_meta").join("settings.json")
}

#[tauri::command]
fn get_consumables(root_path: String) -> Result<Vec<Consumable>, String> {
    let path = consumables_path(Path::new(&root_path));
    if !path.exists() { return Ok(Vec::new()); }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_consumables(root_path: String, consumables: Vec<Consumable>) -> Result<(), String> {
    let meta_dir = Path::new(&root_path).join("_meta");
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;
    fs::write(
        meta_dir.join("consumables.json"),
        serde_json::to_string_pretty(&consumables).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_printers(root_path: String) -> Result<Vec<Printer>, String> {
    let path = printers_path(Path::new(&root_path));
    if !path.exists() { return Ok(Vec::new()); }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_printers(root_path: String, printers: Vec<Printer>) -> Result<(), String> {
    let meta_dir = Path::new(&root_path).join("_meta");
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;
    fs::write(
        meta_dir.join("printers.json"),
        serde_json::to_string_pretty(&printers).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())
}


#[tauri::command]
fn get_electricity_price(root_path: String) -> f64 {
    let path = settings_path(Path::new(&root_path));
    fs::read_to_string(&path).ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["electricity_price_kwh"].as_f64())
        .unwrap_or(0.0)
}

#[tauri::command]
fn save_electricity_price(root_path: String, price: f64) -> Result<(), String> {
    let meta_dir = Path::new(&root_path).join("_meta");
    fs::create_dir_all(&meta_dir).map_err(|e| e.to_string())?;
    let spath = meta_dir.join("settings.json");
    let mut settings = fs::read_to_string(&spath).ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .unwrap_or(serde_json::json!({}));
    settings["electricity_price_kwh"] = serde_json::json!(price);
    fs::write(&spath, serde_json::to_string_pretty(&settings).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_project_sessions(
    project_path: String,
    sessions: Vec<PrintSession>,
    status: String,
    quantity: u32,
    design_time_h: f64,
    design_rate: f64,
    selling_price: f64,
) -> Result<Project, String> {
    let path = Path::new(&project_path);
    let mut meta = read_meta_json(path);
    meta["sessions"] = serde_json::to_value(&sessions).map_err(|e| e.to_string())?;
    meta["status"] = serde_json::json!(status);
    meta["quantity"] = serde_json::json!(quantity.max(1));
    meta["design_time_h"] = serde_json::json!(design_time_h.max(0.0));
    meta["design_rate"] = serde_json::json!(design_rate.max(0.0));
    meta["selling_price"] = serde_json::json!(selling_price.max(0.0));
    fs::write(
        path.join("meta.json"),
        serde_json::to_string_pretty(&meta).unwrap(),
    ).map_err(|e| e.to_string())?;
    Ok(scan_project_dir(path))
}

// ── Infos d'impression 3MF ────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Default)]
pub struct PrintInfo {
    pub print_time: Option<String>,
    pub weight_g: Option<f64>,
}

fn format_duration(secs: u64) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    if h > 0 { format!("{}h {:02}m", h, m) } else { format!("{} min", m) }
}

fn parse_slice_info_json(content: &str, info: &mut PrintInfo) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(content) else { return };

    if info.weight_g.is_none() {
        if let Some(w) = v["weight"].as_f64() {
            info.weight_g = Some(w);
        } else if let Some(w) = v["weight"].as_str().and_then(|s| s.parse::<f64>().ok()) {
            info.weight_g = Some(w);
        } else if let Some(filaments) = v["filament"].as_array() {
            let total: f64 = filaments.iter()
                .filter_map(|f| f["used_g"].as_f64()
                    .or_else(|| f["used_g"].as_str().and_then(|s| s.parse().ok())))
                .sum();
            if total > 0.0 { info.weight_g = Some(total); }
        }
    }

    if info.print_time.is_none() {
        if let Some(secs) = v["prediction"].as_u64() {
            info.print_time = Some(format_duration(secs));
        } else if let Some(secs) = v["prediction"].as_f64() {
            info.print_time = Some(format_duration(secs as u64));
        }
    }
}

fn parse_slic3r_config(content: &str, info: &mut PrintInfo) {
    for line in content.lines() {
        let stripped = line.trim_start_matches(';').trim();
        let Some(eq) = stripped.find('=') else { continue };
        let key = stripped[..eq].trim().to_lowercase();
        let val = stripped[eq + 1..].trim();

        if info.print_time.is_none()
            && key.contains("estimated printing time")
            && key.contains("normal")
        {
            info.print_time = Some(val.to_string());
        } else if info.weight_g.is_none() && key == "filament used [g]" {
            let total: f64 = val.split(',')
                .filter_map(|s| s.trim().parse::<f64>().ok())
                .sum();
            if total > 0.0 { info.weight_g = Some(total); }
        }
    }
}

enum XmlVal { HumanTime, Seconds, Grams }

fn parse_3dmodel_xml(content: &str, info: &mut PrintInfo) {
    use XmlVal::*;
    let candidates: &[(&str, XmlVal)] = &[
        // PrusaSlicer / SuperSlicer
        ("slic3rpe:estimated_printing_time_normal_mode", HumanTime),
        ("estimated_printing_time_normal_mode",          HumanTime),
        ("slic3rpe:filament_used_g",                     Grams),
        ("filament_used_g",                              Grams),
        // Cura / Creality Slicer
        ("cura:print_time",       Seconds),
        ("cura:material_weight",  Grams),
        ("cura:material_mass",    Grams),
    ];
    for (pattern, kind) in candidates {
        match kind {
            HumanTime | Seconds if info.print_time.is_some() => continue,
            Grams if info.weight_g.is_some() => continue,
            _ => {}
        }
        if let Some(idx) = content.find(pattern) {
            if let Some(gt) = content[idx..].find('>') {
                let rest = &content[idx + gt + 1..];
                if let Some(lt) = rest.find('<') {
                    let val = rest[..lt].trim();
                    if val.is_empty() { continue; }
                    match kind {
                        HumanTime => info.print_time = Some(val.to_string()),
                        Seconds => {
                            if let Ok(s) = val.parse::<f64>() {
                                info.print_time = Some(format_duration(s as u64));
                            }
                        }
                        Grams => info.weight_g = val.parse::<f64>().ok(),
                    }
                }
            }
        }
    }
}

#[tauri::command]
fn archive_file(file_path: String) -> Result<Project, String> {
    let src = Path::new(&file_path);
    if !src.is_file() {
        return Err(format!("Fichier introuvable : {}", file_path));
    }
    let project_dir = src.parent().ok_or("Chemin invalide")?;
    let archives_dir = project_dir.join("archives");
    fs::create_dir_all(&archives_dir).map_err(|e| e.to_string())?;

    let filename = src.file_name().ok_or("Nom de fichier invalide")?;
    let candidate = archives_dir.join(filename);
    let dest = if candidate.exists() {
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext  = src.extension().and_then(|e| e.to_str()).unwrap_or("");
        let ts   = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if ext.is_empty() {
            archives_dir.join(format!("{}_{}", stem, ts))
        } else {
            archives_dir.join(format!("{}_{}.{}", stem, ts, ext))
        }
    } else {
        candidate
    };

    fs::rename(src, &dest).map_err(|e| format!("Erreur archivage : {}", e))?;
    Ok(scan_project_dir(project_dir))
}

#[tauri::command]
fn get_3mf_print_info(file_path: String) -> PrintInfo {
    let Ok(file) = fs::File::open(&file_path) else { return PrintInfo::default() };
    let Ok(mut archive) = zip::ZipArchive::new(file) else { return PrintInfo::default() };

    let mut info = PrintInfo::default();

    // OrcaSlicer / BambuStudio
    if let Ok(mut entry) = archive.by_name("Metadata/slice_info.config") {
        let mut content = String::new();
        let _ = entry.read_to_string(&mut content);
        parse_slice_info_json(&content, &mut info);
    }

    // PrusaSlicer / SuperSlicer
    if info.print_time.is_none() || info.weight_g.is_none() {
        if let Ok(mut entry) = archive.by_name("Metadata/Slic3r_PE.config") {
            let mut content = String::new();
            let _ = entry.read_to_string(&mut content);
            parse_slic3r_config(&content, &mut info);
        }
    }

    // Fallback XML (limité aux 128 Ko du début du fichier)
    if info.print_time.is_none() || info.weight_g.is_none() {
        if let Ok(mut entry) = archive.by_name("3D/3dmodel.model") {
            let mut buf = vec![0u8; 131_072];
            let n = entry.read(&mut buf).unwrap_or(0);
            if let Ok(content) = std::str::from_utf8(&buf[..n]) {
                parse_3dmodel_xml(content, &mut info);
            }
        }
    }

    info
}

// ── Miniatures 3MF ────────────────────────────────────────────────────────────

const THUMBNAIL_PATHS: &[&str] = &[
    "Thumbnails/thumbnail.png",
    "Thumbnails/thumbnail_1.png",
    "Thumbnails/thumbnail_167x125.png",
    "Thumbnails/thumbnail_220x165.png",
    ".thumbnails/thumbnail.png",
    "Metadata/plate_1.png",
    "Metadata/plate_1_small.png",
];

#[tauri::command]
fn get_3mf_thumbnail(file_path: String) -> Option<String> {
    let file = fs::File::open(&file_path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;

    for &thumb_path in THUMBNAIL_PATHS {
        if let Ok(mut entry) = archive.by_name(thumb_path) {
            let mut bytes = Vec::new();
            if entry.read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
                return Some(general_purpose::STANDARD.encode(&bytes));
            }
        }
    }

    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index(i).ok().map(|f| f.name().to_string()))
        .filter(|n| {
            let l = n.to_lowercase();
            l.ends_with(".png") && (l.contains("thumbnail") || l.starts_with("metadata/plate"))
        })
        .collect();

    for name in names {
        if let Ok(mut entry) = archive.by_name(&name) {
            let mut bytes = Vec::new();
            if entry.read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
                return Some(general_purpose::STANDARD.encode(&bytes));
            }
        }
    }

    None
}

// ── Runner ────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder_tree,
            scan_projects,
            create_folder,
            rename_folder,
            move_item,
            refresh_project,
            create_project,
            rename_project,
            copy_files_to_project,
            save_markdown,
            get_3mf_thumbnail,
            get_3mf_print_info,
            archive_file,
            read_file_base64,
            open_with_tool,
            save_tags,
            get_consumables,
            save_consumables,
            get_printers,
            save_printers,
            get_electricity_price,
            save_electricity_price,
            save_project_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
