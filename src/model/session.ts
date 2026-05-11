import { SessionConsumable } from "./consumable";

export interface PrintSession {
  id: string;
  name: string;
  file_3mf: string;
  printer_id: string;
  print_time_h: number;
  consumables: SessionConsumable[];
  labor_time_h: number;
  labor_rate: number;
}

export interface SessionFormData {
  id: string;
  name: string;
  file_3mf: string;
  printer_id: string;
  print_time_h: string;
  consumables: SessionConsumable[];
  labor_time_h: string;
  labor_rate: string;
}
