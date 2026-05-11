export type PriceMode = "unit" | "weight" | "volume";

export interface Consumable {
  id: string;
  name: string;
  category: string;
  price_mode: PriceMode;
  price: number;
}

export interface SessionConsumable {
  consumable_id: string;
  quantity: number;
}

export interface ConsFormData {
  id: string;
  name: string;
  category: string;
  price_mode: PriceMode;
  price: string;
}
