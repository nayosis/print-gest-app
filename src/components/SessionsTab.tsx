import { useState } from "react";
import { Project, ThumbnailMap } from "../model";
import { Consumable, SessionConsumable } from "../model/consumable";
import { Printer } from "../model/printer";
import { PrintSession, SessionFormData } from "../model/session";
import { unitLabel } from "../utils/cost";
import { newSessionId } from "../utils/format";
import { SessionCard } from "./SessionCard";

interface SessionsTabProps {
  selected: Project;
  thumbnails: ThumbnailMap;
  consumables: Consumable[];
  printers: Printer[];
  electricityPrice: number;
  onSessionsChange: (sessions: PrintSession[]) => Promise<void>;
}

export function SessionsTab({
  selected,
  thumbnails,
  consumables,
  printers,
  electricityPrice,
  onSessionsChange,
}: SessionsTabProps) {
  const [sessionFormData, setSessionFormData] = useState<SessionFormData | null>(null);
  const [sessionConsPickId, setSessionConsPickId] = useState("");
  const [sessionConsPickQty, setSessionConsPickQty] = useState("");

  const openNewSession = () => {
    setSessionFormData({
      id: "",
      name: "",
      file_3mf: selected.files_3mf[0] ?? "",
      printer_id: printers[0]?.id ?? "",
      print_time_h: "",
      consumables: [],
      labor_time_h: "",
      labor_rate: "",
    });
    setSessionConsPickId("");
    setSessionConsPickQty("");
  };

  const openEditSession = (s: PrintSession) => {
    setSessionFormData({
      id: s.id,
      name: s.name,
      file_3mf: s.file_3mf,
      printer_id: s.printer_id,
      print_time_h: s.print_time_h.toString(),
      consumables: [...s.consumables],
      labor_time_h: s.labor_time_h > 0 ? s.labor_time_h.toString() : "",
      labor_rate: s.labor_rate > 0 ? s.labor_rate.toString() : "",
    });
    setSessionConsPickId("");
    setSessionConsPickQty("");
  };

  const addConsToSession = () => {
    if (!sessionFormData || !sessionConsPickId) return;
    const qty = parseFloat(sessionConsPickQty);
    if (isNaN(qty) || qty <= 0) return;
    const existing = sessionFormData.consumables.find((c) => c.consumable_id === sessionConsPickId);
    const updated: SessionConsumable[] = existing
      ? sessionFormData.consumables.map((c) =>
          c.consumable_id === sessionConsPickId ? { ...c, quantity: c.quantity + qty } : c
        )
      : [...sessionFormData.consumables, { consumable_id: sessionConsPickId, quantity: qty }];
    setSessionFormData({ ...sessionFormData, consumables: updated });
    setSessionConsPickId("");
    setSessionConsPickQty("");
  };

  const removeConsFromSession = (consumableId: string) => {
    if (!sessionFormData) return;
    setSessionFormData({
      ...sessionFormData,
      consumables: sessionFormData.consumables.filter((c) => c.consumable_id !== consumableId),
    });
  };

  const handleSaveSession = async () => {
    if (!sessionFormData) return;
    const h = parseFloat(sessionFormData.print_time_h);
    if (isNaN(h) || h <= 0) return;
    const session: PrintSession = {
      id: sessionFormData.id || newSessionId(),
      name: sessionFormData.name.trim(),
      file_3mf: sessionFormData.file_3mf,
      printer_id: sessionFormData.printer_id,
      print_time_h: h,
      consumables: sessionFormData.consumables,
      labor_time_h: Math.max(0, parseFloat(sessionFormData.labor_time_h) || 0),
      labor_rate: Math.max(0, parseFloat(sessionFormData.labor_rate) || 0),
    };
    const sessions = sessionFormData.id
      ? selected.sessions.map((s) => (s.id === session.id ? session : s))
      : [...selected.sessions, session];
    await onSessionsChange(sessions);
    setSessionFormData(null);
  };

  const handleDeleteSession = async (id: string) => {
    await onSessionsChange(selected.sessions.filter((s) => s.id !== id));
  };

  return (
    <section className="detail-section">
      <div className="section-header-row">
        <h2>Sessions d'impression</h2>
        {!sessionFormData && (
          <button className="btn-primary-sm" onClick={openNewSession}>+ Nouvelle session</button>
        )}
      </div>

      <div className="iteration-banner">
        <span className="iteration-banner-icon">🔄</span>
        <div className="iteration-banner-text">
          <strong>1 itération</strong> = toutes les sessions réalisées une fois
          {selected.sessions.length > 0 && (
            <> — <strong>{selected.sessions.length} session{selected.sessions.length > 1 ? "s" : ""}</strong> produisant <strong>{selected.quantity} objet{selected.quantity > 1 ? "s" : ""}</strong></>
          )}
        </div>
      </div>

      {sessionFormData && (
        <div className="session-form">
          <div className="session-form-row">
            <label>Nom</label>
            <input className="cons-form-input" placeholder="ex : Plateau principal…"
              value={sessionFormData.name}
              onChange={(e) => setSessionFormData({ ...sessionFormData, name: e.target.value })} />
          </div>
          <div className="session-form-row">
            <label>Fichier 3MF</label>
            {selected.files_3mf.length > 0 ? (
              <select className="cons-form-select" value={sessionFormData.file_3mf}
                onChange={(e) => setSessionFormData({ ...sessionFormData, file_3mf: e.target.value })}>
                {selected.files_3mf.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            ) : (
              <input className="cons-form-input" placeholder="nom-du-fichier.3mf"
                value={sessionFormData.file_3mf}
                onChange={(e) => setSessionFormData({ ...sessionFormData, file_3mf: e.target.value })} />
            )}
          </div>
          <div className="session-form-row">
            <label>Imprimante</label>
            {printers.length > 0 ? (
              <select className="cons-form-select" value={sessionFormData.printer_id}
                onChange={(e) => setSessionFormData({ ...sessionFormData, printer_id: e.target.value })}>
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.power_w} W</option>
                ))}
              </select>
            ) : (
              <span className="session-form-hint">Aucune imprimante — configure-en dans Consommables</span>
            )}
          </div>
          <div className="session-form-row">
            <label>Durée</label>
            <div className="cons-form-price-row">
              <input className="cons-form-input cons-form-price" type="number" min="0" step="0.01" placeholder="0.00"
                value={sessionFormData.print_time_h}
                onChange={(e) => setSessionFormData({ ...sessionFormData, print_time_h: e.target.value })} />
              <span className="cons-form-unit">h</span>
            </div>
          </div>
          <div className="session-form-cons-section">
            <span className="session-form-cons-label">Consommables</span>
            {sessionFormData.consumables.length > 0 && (
              <div className="session-form-cons-list">
                {sessionFormData.consumables.map((sc) => {
                  const c = consumables.find((x) => x.id === sc.consumable_id);
                  return (
                    <div key={sc.consumable_id} className="session-form-cons-row">
                      <span className="session-form-cons-name">{c?.name ?? "?"}</span>
                      <span className="session-form-cons-qty">{sc.quantity} {c ? unitLabel(c) : ""}</span>
                      <button className="btn-icon-sm btn-danger-icon" onClick={() => removeConsFromSession(sc.consumable_id)}>🗑</button>
                    </div>
                  );
                })}
              </div>
            )}
            {consumables.length > 0 && (
              <div className="cost-add-form">
                <select className="cost-add-select" value={sessionConsPickId}
                  onChange={(e) => setSessionConsPickId(e.target.value)}>
                  <option value="">+ Ajouter un consommable…</option>
                  {[...consumables]
                    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.category ? `[${c.category}] ` : ""}{c.name}</option>
                    ))}
                </select>
                <input className="cost-add-qty" type="number" min="0" step="any" placeholder="Qté"
                  value={sessionConsPickQty}
                  onChange={(e) => setSessionConsPickQty(e.target.value)} />
                {sessionConsPickId && (
                  <span className="cost-add-unit">
                    {unitLabel(consumables.find((c) => c.id === sessionConsPickId)!)}
                  </span>
                )}
                <button className="btn-save" onClick={addConsToSession}
                  disabled={!sessionConsPickId || !sessionConsPickQty || parseFloat(sessionConsPickQty) <= 0}>
                  Ajouter
                </button>
              </div>
            )}
          </div>
          <div className="session-form-cons-section">
            <span className="session-form-cons-label">Main d'œuvre</span>
            <div className="session-form-row">
              <label>Temps</label>
              <div className="cons-form-price-row">
                <input className="cons-form-input cons-form-price" type="number" min="0" step="0.5" placeholder="0"
                  value={sessionFormData.labor_time_h}
                  onChange={(e) => setSessionFormData({ ...sessionFormData, labor_time_h: e.target.value })} />
                <span className="cons-form-unit">h</span>
              </div>
            </div>
            <div className="session-form-row">
              <label>Taux horaire</label>
              <div className="cons-form-price-row">
                <input className="cons-form-input cons-form-price" type="number" min="0" step="1" placeholder="0"
                  value={sessionFormData.labor_rate}
                  onChange={(e) => setSessionFormData({ ...sessionFormData, labor_rate: e.target.value })} />
                <span className="cons-form-unit">€/h</span>
              </div>
            </div>
            {parseFloat(sessionFormData.labor_time_h) > 0 && parseFloat(sessionFormData.labor_rate) > 0 && (
              <div className="session-form-hint">
                Coût MO : {(parseFloat(sessionFormData.labor_time_h) * parseFloat(sessionFormData.labor_rate)).toFixed(2)} €
              </div>
            )}
          </div>
          <div className="cons-form-actions">
            <button className="btn-cancel" onClick={() => setSessionFormData(null)}>Annuler</button>
            <button className="btn-save" onClick={handleSaveSession}
              disabled={!sessionFormData.print_time_h || parseFloat(sessionFormData.print_time_h) <= 0}>
              {sessionFormData.id ? "Mettre à jour" : "Créer la session"}
            </button>
          </div>
        </div>
      )}

      {selected.sessions.length === 0 && !sessionFormData ? (
        <p className="empty-files">Aucune session d'impression enregistrée.</p>
      ) : (
        <div className="session-list">
          {selected.sessions.map((s, idx) => (
            <SessionCard
              key={s.id}
              session={s}
              index={idx}
              thumbnail={thumbnails[s.file_3mf]}
              consumables={consumables}
              printers={printers}
              electricityPrice={electricityPrice}
              onEdit={() => openEditSession(s)}
              onDelete={() => handleDeleteSession(s.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
