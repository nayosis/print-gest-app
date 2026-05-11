import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Consumable, ConsFormData, PriceMode } from "../model/consumable";
import { Printer, PrinterFormData } from "../model/printer";
import { priceUnitLabel } from "../utils/cost";

interface ConsumablesViewProps {
  rootFolder: string;
  consumables: Consumable[];
  printers: Printer[];
  electricityPrice: number;
  onConsumablesChange: (c: Consumable[]) => void;
  onPrintersChange: (p: Printer[]) => void;
  onElectricityChange: (n: number) => void;
}

export function ConsumablesView({
  rootFolder,
  consumables,
  printers,
  electricityPrice,
  onConsumablesChange,
  onPrintersChange,
  onElectricityChange,
}: ConsumablesViewProps) {
  const [consForm, setConsForm] = useState<ConsFormData | null>(null);
  const [printerForm, setPrinterForm] = useState<PrinterFormData | null>(null);
  const [editingKwh, setEditingKwh] = useState(false);
  const [kwhInput, setKwhInput] = useState("");

  const openBlankConsForm = () =>
    setConsForm({ id: "", name: "", category: "", price_mode: "unit", price: "" });

  const handleSaveConsumable = async () => {
    if (!consForm) return;
    const priceNum = parseFloat(consForm.price);
    if (!consForm.name.trim() || isNaN(priceNum) || priceNum < 0) return;
    const cons: Consumable = {
      id: consForm.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: consForm.name.trim(),
      category: consForm.category.trim(),
      price_mode: consForm.price_mode,
      price: priceNum,
    };
    const updated = consForm.id
      ? consumables.map((c) => (c.id === consForm.id ? cons : c))
      : [...consumables, cons];
    await invoke("save_consumables", { rootPath: rootFolder, consumables: updated });
    onConsumablesChange(updated);
    setConsForm(null);
  };

  const handleDeleteConsumable = async (id: string) => {
    const updated = consumables.filter((c) => c.id !== id);
    await invoke("save_consumables", { rootPath: rootFolder, consumables: updated });
    onConsumablesChange(updated);
  };

  const handleSavePrinter = async () => {
    if (!printerForm) return;
    const wNum = parseFloat(printerForm.power_w);
    if (!printerForm.name.trim() || isNaN(wNum) || wNum <= 0) return;
    const p: Printer = {
      id: printerForm.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: printerForm.name.trim(),
      power_w: wNum,
      wear_rate: Math.max(0, parseFloat(printerForm.wear_rate) || 0),
    };
    const updated = printerForm.id
      ? printers.map((pr) => (pr.id === printerForm.id ? p : pr))
      : [...printers, p];
    await invoke("save_printers", { rootPath: rootFolder, printers: updated });
    onPrintersChange(updated);
    setPrinterForm(null);
  };

  const handleDeletePrinter = async (id: string) => {
    const updated = printers.filter((p) => p.id !== id);
    await invoke("save_printers", { rootPath: rootFolder, printers: updated });
    onPrintersChange(updated);
  };

  const handleSaveKwh = async () => {
    const v = parseFloat(kwhInput);
    if (isNaN(v) || v < 0) return;
    await invoke("save_electricity_price", { rootPath: rootFolder, price: v });
    onElectricityChange(v);
    setEditingKwh(false);
  };

  return (
    <div className="consumables-view">
      {/* Section Consommables */}
      <div className="global-section">
        <div className="consumables-header">
          <h2>Consommables</h2>
          <button className="btn-primary-sm" onClick={openBlankConsForm}>+ Nouveau</button>
        </div>
        {consForm && (
          <div className="cons-form">
            <input className="cons-form-input" placeholder="Nom *" autoFocus
              value={consForm.name} onChange={(e) => setConsForm({ ...consForm, name: e.target.value })} />
            <input className="cons-form-input" placeholder="Catégorie (ex : Filament, Résine…)"
              value={consForm.category} onChange={(e) => setConsForm({ ...consForm, category: e.target.value })} />
            <select className="cons-form-select" value={consForm.price_mode}
              onChange={(e) => setConsForm({ ...consForm, price_mode: e.target.value as PriceMode })}>
              <option value="unit">À l'unité (€/unité)</option>
              <option value="weight">Au poids (€/kg, quantité en g)</option>
              <option value="volume">Au volume (€/L, quantité en ml)</option>
            </select>
            <div className="cons-form-price-row">
              <input className="cons-form-input cons-form-price" type="number" min="0" step="0.001" placeholder="Prix *"
                value={consForm.price} onChange={(e) => setConsForm({ ...consForm, price: e.target.value })} />
              <span className="cons-form-unit">{priceUnitLabel({ ...consForm, price: 0, id: "" })}</span>
            </div>
            <div className="cons-form-actions">
              <button className="btn-cancel" onClick={() => setConsForm(null)}>Annuler</button>
              <button className="btn-save" onClick={handleSaveConsumable}
                disabled={!consForm.name.trim() || !consForm.price || isNaN(parseFloat(consForm.price))}>
                {consForm.id ? "Mettre à jour" : "Créer"}
              </button>
            </div>
          </div>
        )}
        {consumables.length === 0 && !consForm
          ? <p className="empty-files" style={{ padding: "16px 0" }}>Aucun consommable.</p>
          : <div className="cons-list">
              {[...consumables]
                .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
                .map((c) => (
                <div key={c.id} className="cons-item">
                  <div className="cons-item-info">
                    <span className="cons-item-name">{c.name}</span>
                    {c.category && <span className="cons-item-category">{c.category}</span>}
                  </div>
                  <span className="cons-item-price">{c.price.toFixed(3)} {priceUnitLabel(c)}</span>
                  <div className="cons-item-actions">
                    <button className="btn-icon-sm" title="Modifier"
                      onClick={() => setConsForm({ ...c, price: c.price.toString() })}>✏</button>
                    <button className="btn-icon-sm btn-danger-icon" title="Supprimer"
                      onClick={() => handleDeleteConsumable(c.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>

      {/* Section Électricité */}
      <div className="global-section">
        <div className="consumables-header">
          <h2>⚡ Électricité</h2>
        </div>
        <div className="kwh-row">
          <span className="kwh-label">Prix du kWh</span>
          {editingKwh ? (
            <>
              <input className="kwh-input" type="number" min="0" step="0.0001" autoFocus
                value={kwhInput} onChange={(e) => setKwhInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveKwh(); if (e.key === "Escape") setEditingKwh(false); }} />
              <span className="kwh-unit">€/kWh</span>
              <button className="btn-save" onClick={handleSaveKwh}>OK</button>
              <button className="btn-cancel" onClick={() => setEditingKwh(false)}>Annuler</button>
            </>
          ) : (
            <>
              <span className="kwh-value">{electricityPrice.toFixed(4)} €/kWh</span>
              <button className="btn-icon-sm" title="Modifier"
                onClick={() => { setKwhInput(electricityPrice.toString()); setEditingKwh(true); }}>✏</button>
            </>
          )}
        </div>
      </div>

      {/* Section Imprimantes */}
      <div className="global-section">
        <div className="consumables-header">
          <h2>🖨 Imprimantes</h2>
          <button className="btn-primary-sm"
            onClick={() => setPrinterForm({ id: "", name: "", power_w: "", wear_rate: "" })}>+ Ajouter</button>
        </div>
        {printerForm && (
          <div className="cons-form">
            <input className="cons-form-input" placeholder="Nom de l'imprimante *" autoFocus
              value={printerForm.name} onChange={(e) => setPrinterForm({ ...printerForm, name: e.target.value })} />
            <div className="cons-form-price-row">
              <input className="cons-form-input cons-form-price" type="number" min="0" step="1"
                placeholder="Consommation *"
                value={printerForm.power_w} onChange={(e) => setPrinterForm({ ...printerForm, power_w: e.target.value })} />
              <span className="cons-form-unit">W</span>
            </div>
            <div className="cons-form-actions">
              <button className="btn-cancel" onClick={() => setPrinterForm(null)}>Annuler</button>
              <button className="btn-save" onClick={handleSavePrinter}
                disabled={!printerForm.name.trim() || !printerForm.power_w || isNaN(parseFloat(printerForm.power_w))}>
                {printerForm.id ? "Mettre à jour" : "Ajouter"}
              </button>
            </div>
          </div>
        )}
        {printers.length === 0 && !printerForm
          ? <p className="empty-files" style={{ padding: "16px 0" }}>Aucune imprimante configurée.</p>
          : <div className="cons-list">
              {printers.map((p) => (
                <div key={p.id} className="cons-item">
                  <div className="cons-item-info">
                    <span className="cons-item-name">{p.name}</span>
                  </div>
                  <span className="cons-item-price">{p.power_w} W</span>
                  {electricityPrice > 0 && (
                    <span className="cons-item-kwh-hint">
                      {((p.power_w / 1000) * electricityPrice).toFixed(4)} €/h
                    </span>
                  )}
                  <div className="cons-item-actions">
                    <button className="btn-icon-sm" title="Modifier"
                      onClick={() => setPrinterForm({ ...p, power_w: p.power_w.toString(), wear_rate: (p.wear_rate ?? 0).toString() })}>✏</button>
                    <button className="btn-icon-sm btn-danger-icon" title="Supprimer"
                      onClick={() => handleDeletePrinter(p.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}
