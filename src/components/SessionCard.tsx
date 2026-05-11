import { PrintSession } from "../model/session";
import { Consumable } from "../model/consumable";
import { Printer } from "../model/printer";
import { computeSessionCost, sessionTotal, calcCost, unitLabel } from "../utils/cost";

interface SessionCardProps {
  session: PrintSession;
  index: number;
  thumbnail: string | null | undefined;
  consumables: Consumable[];
  printers: Printer[];
  electricityPrice: number;
  onEdit: () => void;
  onDelete: () => void;
}

export function SessionCard({
  session,
  index,
  thumbnail,
  consumables,
  printers,
  electricityPrice,
  onEdit,
  onDelete,
}: SessionCardProps) {
  const pr = printers.find((p) => p.id === session.printer_id);
  const cost = computeSessionCost(session, consumables, printers, electricityPrice);
  const total = sessionTotal(cost);

  return (
    <div className="session-card">
      <div className="session-card-header">
        {thumbnail && (
          <img src={`data:image/png;base64,${thumbnail}`} className="session-card-thumb" alt={session.file_3mf} />
        )}
        <div className="session-card-title">
          <span className="session-card-index">#{index + 1}</span>
          <span className="session-card-name">{session.name || session.file_3mf || "Session sans nom"}</span>
        </div>
        <div className="session-card-actions">
          <button className="btn-icon-sm" title="Modifier" onClick={onEdit}>✏</button>
          <button className="btn-icon-sm btn-danger-icon" title="Supprimer" onClick={onDelete}>🗑</button>
        </div>
      </div>
      <div className="session-card-meta">
        {session.file_3mf && <span className="session-meta-chip">📦 {session.file_3mf}</span>}
        {pr && <span className="session-meta-chip">🖨 {pr.name}</span>}
        <span className="session-meta-chip">⏱ {session.print_time_h} h</span>
      </div>
      {session.consumables.length > 0 && (
        <div className="session-cons-list">
          {session.consumables.map((sc) => {
            const c = consumables.find((x) => x.id === sc.consumable_id);
            return (
              <span key={sc.consumable_id} className="session-cons-chip">
                {c?.name ?? "?"} × {sc.quantity}{c ? ` ${unitLabel(c)}` : ""}
                {c ? ` — ${calcCost(c, sc.quantity).toFixed(2)} €` : ""}
              </span>
            );
          })}
        </div>
      )}
      {(cost.mat > 0 || cost.elec > 0 || cost.labor > 0) && (
        <div className="session-card-cost">
          {cost.mat > 0 && <span>Matière : {cost.mat.toFixed(2)} €</span>}
          {cost.elec > 0 && <span>Électricité : {cost.elec.toFixed(3)} €</span>}
          {cost.labor > 0 && <span>MO : {cost.labor.toFixed(2)} €</span>}
          <span className="session-card-total">Total : {total.toFixed(2)} €</span>
        </div>
      )}
    </div>
  );
}
