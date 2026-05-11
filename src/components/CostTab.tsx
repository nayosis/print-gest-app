import { Project } from "../model";
import { Consumable } from "../model/consumable";
import { Printer } from "../model/printer";
import { computeSessionCost, sessionTotal, calcCost, unitLabel } from "../utils/cost";

interface CostTabProps {
  selected: Project;
  consumables: Consumable[];
  printers: Printer[];
  electricityPrice: number;
}

function Row({ label, value, muted, bold, green, red, blue }: {
  label: string; value: string;
  muted?: boolean; bold?: boolean; green?: boolean; red?: boolean; blue?: boolean;
}) {
  const cls = [
    "cost-row",
    muted ? "cost-row-muted" : "",
    bold ? "cost-row-bold" : "",
    green ? "cost-val-green" : red ? "cost-val-red" : blue ? "cost-val-blue" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function CostTab({ selected, consumables, printers, electricityPrice }: CostTabProps) {
  const totals = { mat: 0, elec: 0, wear: 0, labor: 0 };

  return (
    <div className="cost-tab">
      {selected.sessions.length === 0 ? (
        <p className="empty-files">Aucune session d'impression configurée.</p>
      ) : (
        selected.sessions.map((s, idx) => {
          const cost = computeSessionCost(s, consumables, printers, electricityPrice);
          const total = sessionTotal(cost);
          totals.mat += cost.mat;
          totals.elec += cost.elec;
          totals.wear += cost.wear;
          totals.labor += cost.labor;

          const pr = printers.find((p) => p.id === s.printer_id);

          return (
            <div key={s.id} className="cost-session-block">
              <div className="cost-session-title">
                #{idx + 1} — {s.name || s.file_3mf || "Session"}
              </div>

              {/* Matériaux */}
              {s.consumables.length > 0 && (
                <div className="cost-group">
                  <div className="cost-group-label">Matériaux</div>
                  {s.consumables.map((sc) => {
                    const c = consumables.find((x) => x.id === sc.consumable_id);
                    if (!c) return null;
                    return (
                      <Row key={sc.consumable_id} muted
                        label={`${c.name} — ${sc.quantity} ${unitLabel(c)}`}
                        value={`${calcCost(c, sc.quantity).toFixed(2)} €`}
                      />
                    );
                  })}
                  <Row label="Sous-total matériaux" value={`${cost.mat.toFixed(2)} €`} />
                </div>
              )}

              {/* Électricité */}
              {pr && electricityPrice > 0 && s.print_time_h > 0 && (
                <div className="cost-group">
                  <div className="cost-group-label">Électricité</div>
                  <Row muted
                    label={`${pr.power_w} W × ${s.print_time_h} h × ${electricityPrice} €/kWh`}
                    value={`${cost.elec.toFixed(4)} €`}
                  />
                </div>
              )}

              {/* Usure imprimante */}
              {pr && s.print_time_h > 0 && (
                <div className="cost-group">
                  <div className="cost-group-label">Usure imprimante</div>
                  <Row muted
                    label={`${pr.name} — ${(pr.wear_rate ?? 1).toFixed(2)} €/h × ${s.print_time_h} h`}
                    value={`${cost.wear.toFixed(2)} €`}
                  />
                </div>
              )}

              {/* Main d'œuvre */}
              {cost.labor > 0 && (
                <div className="cost-group">
                  <div className="cost-group-label">Main d'œuvre</div>
                  <Row muted
                    label={`${s.labor_time_h} h × ${s.labor_rate} €/h`}
                    value={`${cost.labor.toFixed(2)} €`}
                  />
                </div>
              )}

              <Row bold label="Total session" value={`${total.toFixed(2)} €`} blue />
            </div>
          );
        })
      )}

      {/* Totaux globaux */}
      {selected.sessions.length > 0 && (() => {
        const prodTotal = totals.mat + totals.elec + totals.wear + totals.labor;
        const costPerUnit = selected.quantity > 0 ? prodTotal / selected.quantity : 0;
        const designCost = selected.design_time_h * selected.design_rate;
        const marginPerUnit = selected.selling_price > 0 ? selected.selling_price - costPerUnit : null;
        const breakEven =
          designCost > 0 && marginPerUnit !== null && marginPerUnit > 0
            ? Math.ceil(designCost / marginPerUnit)
            : null;

        return (
          <div className="cost-session-block cost-totals-block">
            <div className="cost-session-title">Récapitulatif global</div>
            {totals.mat > 0 && <Row label="Total matériaux" value={`${totals.mat.toFixed(2)} €`} />}
            {totals.elec > 0 && <Row label="Total électricité" value={`${totals.elec.toFixed(4)} €`} />}
            {totals.wear > 0 && <Row label="Total usure imprimantes" value={`${totals.wear.toFixed(2)} €`} />}
            {totals.labor > 0 && <Row label="Total main d'œuvre" value={`${totals.labor.toFixed(2)} €`} />}
            <div className="cost-divider" />
            <Row bold blue label="Total production" value={`${prodTotal.toFixed(2)} €`} />
            {selected.quantity > 1 && (
              <Row muted label={`Par objet (×${selected.quantity})`} value={`${costPerUnit.toFixed(2)} €`} />
            )}
            {designCost > 0 && (
              <>
                <div className="cost-divider" />
                <Row muted label={`Conception (${selected.design_time_h} h × ${selected.design_rate} €/h)`} value={`${designCost.toFixed(2)} €`} />
              </>
            )}
            {selected.selling_price > 0 && (
              <>
                <div className="cost-divider" />
                <Row label="Prix de vente" value={`${selected.selling_price.toFixed(2)} €`} />
                {marginPerUnit !== null && (
                  <Row bold
                    label="Marge par objet"
                    value={`${marginPerUnit >= 0 ? "+" : ""}${marginPerUnit.toFixed(2)} €`}
                    green={marginPerUnit > 0}
                    red={marginPerUnit <= 0}
                  />
                )}
                {breakEven !== null && (
                  <div className="cost-breakeven">
                    Rentable en <strong>{breakEven}</strong> vente{breakEven > 1 ? "s" : ""}
                  </div>
                )}
                {marginPerUnit !== null && marginPerUnit <= 0 && (
                  <div className="cost-breakeven cost-breakeven-warn">Marge insuffisante</div>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
