export interface Project {
  name: string;
  title: string | null;
  tags: string[];
  path: string;
  f3d_files: string[];
  files_3mf: string[];
  stl_files: string[];
  mp4_files: string[];
  markdown_content: string | null;
}

export interface ThumbnailMap {
  [filename: string]: string | null;
}
