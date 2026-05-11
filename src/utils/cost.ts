import { Consumable } from "../model/consumable";
import { Printer } from "../model/printer";
import { PrintSession } from "../model/session";

export function calcCost(c: Consumable, qty: number): number {
  if (c.price_mode === "unit") return qty * c.price;
  return (qty / 1000) * c.price;
}

export function unitLabel(c: Consumable): string {
  if (c.price_mode === "unit") return "unité(s)";
  if (c.price_mode === "weight") return "g";
  return "ml";
}

export function priceUnitLabel(c: Consumable): string {
  if (c.price_mode === "unit") return "€/unité";
  if (c.price_mode === "weight") return "€/kg";
  return "€/L";
}

export function printerCost(p: Printer, hours: number, kwh: number): number {
  return (p.power_w / 1000) * hours * kwh;
}

export interface SessionCostResult {
  mat: number;
  elec: number;
  wear: number;
  labor: number;
}

export function computeSessionCost(
  s: PrintSession,
  consumables: Consumable[],
  printers: Printer[],
  electricityPrice: number
): SessionCostResult {
  const mat = s.consumables.reduce((sum, sc) => {
    const c = consumables.find((x) => x.id === sc.consumable_id);
    return c ? sum + calcCost(c, sc.quantity) : sum;
  }, 0);
  const pr = printers.find((p) => p.id === s.printer_id);
  const elec = pr ? printerCost(pr, s.print_time_h, electricityPrice) : 0;
  const wear = pr ? (pr.wear_rate ?? 0) * s.print_time_h : 0;
  const labor = (s.labor_time_h ?? 0) * (s.labor_rate ?? 0);
  return { mat, elec, wear, labor };
}

export function sessionTotal(cost: SessionCostResult): number {
  return cost.mat + cost.elec + cost.wear + cost.labor;
}
