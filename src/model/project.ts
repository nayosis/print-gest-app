import { PrintSession } from "./session";

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
  status: string;
  sessions: PrintSession[];
  quantity: number;
  design_time_h: number;
  design_rate: number;
  selling_price: number;
}

export interface PrintInfo {
  print_time: string | null;
  weight_g: number | null;
}

export interface ThumbnailMap {
  [filename: string]: string | null;
}
