use std::fs;
use std::io::Read;
use std::path::Path;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};

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
}

// ── Helpers ──────────────────────────────────────────────────────────────────

struct Meta {
    title: Option<String>,
    tags: Vec<String>,
}

fn read_meta(dir: &Path) -> Meta {
    let Ok(content) = fs::read_to_string(dir.join("meta.json")) else {
        return Meta { title: None, tags: Vec::new() };
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) else {
        return Meta { title: None, tags: Vec::new() };
    };
    let title = v["title"].as_str().map(|s| s.to_string());
    let tags = v["tags"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|t| t.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    Meta { title, tags }
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
fn scan_projects(folder_path: String) -> Result<Vec<Project>, String> {
    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Dossier introuvable : {}", folder_path));
    }

    let mut projects: Vec<Project> = fs::read_dir(path)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|e| e.path().is_dir())
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
            scan_projects,
            refresh_project,
            create_project,
            rename_project,
            copy_files_to_project,
            save_markdown,
            get_3mf_thumbnail,
            read_file_base64,
            open_with_tool,
            save_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
