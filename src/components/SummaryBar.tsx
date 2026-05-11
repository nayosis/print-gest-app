import { Project, ThumbnailMap } from "../model";
import { Consumable } from "../model/consumable";
import { Printer } from "../model/printer";
import { computeSessionCost, sessionTotal } from "../utils/cost";

interface SummaryBarProps {
  selected: Project;
  thumbnails: ThumbnailMap;
  consumables: Consumable[];
  printers: Printer[];
  electricityPrice: number;
}

export function SummaryBar({
  selected,
  thumbnails,
  consumables,
  printers,
  electricityPrice,
}: SummaryBarProps) {
  return (
    <div className="summary-bar">
      <div className="summary-sessions-scroll">
        {selected.sessions.length === 0 ? (
          <span className="summary-empty">Aucune session d'impression configurée</span>
        ) : selected.sessions.map((s, idx) => {
          const cost = computeSessionCost(s, consumables, printers, electricityPrice);
          const total = sessionTotal(cost);
          const b64 = thumbnails[s.file_3mf];
          return (
            <div key={s.id} className="summary-mini-card">
              {b64
                ? <img src={`data:image/png;base64,${b64}`} className="summary-mini-thumb" alt={s.file_3mf} />
                : <div className="summary-mini-thumb summary-mini-thumb-ph">📦</div>
              }
              <div className="summary-mini-info">
                <span className="summary-mini-name">
                  <span className="cost-summary-index">#{idx + 1}</span>
                  {" "}{s.name || s.file_3mf || "Session"}
                </span>
                {total > 0 && <span className="summary-mini-cost">{total.toFixed(2)} €</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="summary-totals-panel">
        {(() => {
          const grand = selected.sessions.reduce(
            (acc, s) => {
              const cost = computeSessionCost(s, consumables, printers, electricityPrice);
              return {
                mat: acc.mat + cost.mat,
                elec: acc.elec + cost.elec,
                labor: acc.labor + cost.labor,
              };
            },
            { mat: 0, elec: 0, labor: 0 }
          );
          const prodTotal = grand.mat + grand.elec + grand.labor;
          const costPerUnit = selected.quantity > 0 ? prodTotal / selected.quantity : 0;
          const designCost = selected.design_time_h * selected.design_rate;
          const hasSelling = selected.selling_price > 0;
          const marginPerUnit = hasSelling ? selected.selling_price - costPerUnit : null;
          const breakEven =
            designCost > 0 && marginPerUnit !== null && marginPerUnit > 0
              ? Math.ceil(designCost / marginPerUnit)
              : null;

          return (
            <>
              {prodTotal > 0 ? (
                <>
                  <div className="summary-total-line">
                    <span>Production</span>
                    <span className="summary-val-blue">{prodTotal.toFixed(2)} €</span>
                  </div>
                  {selected.quantity > 1 && (
                    <div className="summary-total-line summary-line-muted">
                      <span>Par objet (×{selected.quantity})</span>
                      <span>{costPerUnit.toFixed(2)} €</span>
                    </div>
                  )}
                </>
              ) : (
                <span className="summary-empty">Pas de coût configuré</span>
              )}
              {hasSelling && (
                <>
                  <div className="summary-divider" />
                  <div className="summary-total-line">
                    <span>Prix de vente</span>
                    <span className="summary-val-blue">{selected.selling_price.toFixed(2)} €</span>
                  </div>
                  {prodTotal > 0 && marginPerUnit !== null && (
                    <div className={`summary-total-line ${marginPerUnit >= 0 ? "summary-val-green" : "summary-val-red"}`}>
                      <span>Marge/objet</span>
                      <span>{marginPerUnit >= 0 ? "+" : ""}{marginPerUnit.toFixed(2)} €</span>
                    </div>
                  )}
                </>
              )}
              {designCost > 0 && (
                <>
                  <div className="summary-divider" />
                  <div className="summary-total-line summary-line-muted">
                    <span>Conception ({selected.design_time_h} h)</span>
                    <span>{designCost.toFixed(2)} €</span>
                  </div>
                  {breakEven !== null && (
                    <div className="summary-breakeven">
                      Rentable en <strong>{breakEven}</strong> vente{breakEven > 1 ? "s" : ""}
                    </div>
                  )}
                  {marginPerUnit !== null && marginPerUnit <= 0 && (
                    <div className="summary-breakeven summary-breakeven-warn">Marge insuffisante</div>
                  )}
                </>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
