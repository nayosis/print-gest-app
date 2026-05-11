import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Project, PrintInfo, ThumbnailMap } from "../model";

export function useThumbnails(selected: Project | null): {
  thumbnails: ThumbnailMap;
  stlData: Record<string, string | null>;
  printInfoMap: Record<string, PrintInfo>;
} {
  const [thumbnails, setThumbnails] = useState<ThumbnailMap>({});
  const [stlData, setStlData] = useState<Record<string, string | null>>({});
  const [printInfoMap, setPrintInfoMap] = useState<Record<string, PrintInfo>>({});

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

  return { thumbnails, stlData, printInfoMap };
}
