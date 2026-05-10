export type PriceMode = "unit" | "weight" | "volume";

export interface Consumable {
  id: string;
  name: string;
  category: string;
  price_mode: PriceMode;
  price: number;
}

export interface Printer {
  id: string;
  name: string;
  power_w: number;
}

export interface SessionConsumable {
  consumable_id: string;
  quantity: number;
}

export interface PrintSession {
  id: string;
  name: string;
  file_3mf: string;
  printer_id: string;
  print_time_h: number;
  consumables: SessionConsumable[];
}

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
}

export interface PrintInfo {
  print_time: string | null;
  weight_g: number | null;
}

export interface ThumbnailMap {
  [filename: string]: string | null;
}
