import { convertFileSrc } from "@tauri-apps/api/core";
import { Project, ThumbnailMap, PrintInfo } from "../model";
import { StlViewer } from "../StlViewer";

interface FilesTabProps {
  selected: Project;
  thumbnails: ThumbnailMap;
  stlData: Record<string, string | null>;
  printInfoMap: Record<string, PrintInfo>;
  toolPath?: string | null;
  onContextMenu: (x: number, y: number, filePath: string) => void;
  onVideoPlay: (src: string, name: string) => void;
}

export function FilesTab({
  selected,
  thumbnails,
  stlData,
  printInfoMap,
  onContextMenu,
  onVideoPlay,
}: FilesTabProps) {
  const totalFiles = selected.f3d_files.length + selected.files_3mf.length + selected.stl_files.length;

  return (
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
                <div
                  key={file}
                  className="thumb-card"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenu(e.clientX, e.clientY, `${selected.path}\\${file}`);
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
                  {hasInfo && (
                    <div className="thumb-print-info">
                      {info.print_time && <span className="thumb-print-stat">⏱ {info.print_time}</span>}
                      {info.weight_g !== null && (
                        <span className="thumb-print-stat">⚖ {info.weight_g!.toFixed(1)} g</span>
                      )}
                    </div>
                  )}
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
                    onContextMenu(e.clientX, e.clientY, `${selected.path}\\${file}`);
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
      {selected.f3d_files.length > 0 && (
        <section className="detail-section">
          <h2>Fusion 360</h2>
          <ul className="file-list">
            {selected.f3d_files.map((file) => (
              <li key={file} className="file-item">
                <span className="file-icon">📐</span>{file}
              </li>
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
                <button key={file} className="video-card" onClick={() => onVideoPlay(src, file)}>
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
  );
}
