export interface Printer {
  id: string;
  name: string;
  power_w: number;
  wear_rate: number;
}

export interface PrinterFormData {
  id: string;
  name: string;
  power_w: string;
  wear_rate: string;
}
