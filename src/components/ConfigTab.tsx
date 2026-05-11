import { useState, useEffect } from "react";
import { Project } from "../model";

interface ConfigTabProps {
  selected: Project;
  onQuantityChange: (delta: number) => void;
  onPricingChange: (designTimeH: number, designRate: number, sellingPrice: number) => void;
}

export function ConfigTab({ selected, onQuantityChange, onPricingChange }: ConfigTabProps) {
  const [designTimeInput, setDesignTimeInput] = useState(
    selected.design_time_h ? selected.design_time_h.toString() : ""
  );
  const [designRateInput, setDesignRateInput] = useState(
    selected.design_rate ? selected.design_rate.toString() : ""
  );
  const [sellingPriceInput, setSellingPriceInput] = useState(
    selected.selling_price ? selected.selling_price.toString() : ""
  );

  useEffect(() => {
    setDesignTimeInput(selected.design_time_h ? selected.design_time_h.toString() : "");
    setDesignRateInput(selected.design_rate ? selected.design_rate.toString() : "");
    setSellingPriceInput(selected.selling_price ? selected.selling_price.toString() : "");
  }, [selected.path]);

  const handleSavePricing = () => {
    onPricingChange(
      Math.max(0, parseFloat(designTimeInput) || 0),
      Math.max(0, parseFloat(designRateInput) || 0),
      Math.max(0, parseFloat(sellingPriceInput) || 0),
    );
  };

  return (
    <div>
      <section className="detail-section">
        <h2>Production</h2>
        <div className="config-row">
          <div className="config-row-info">
            <span className="config-row-label">Quantité produite</span>
            <span className="config-row-hint">Nombre d'objets fabriqués par ce projet</span>
          </div>
          <div className="cost-summary-qty-ctrl">
            <button className="qty-btn" onClick={() => onQuantityChange(-1)} disabled={selected.quantity <= 1}>−</button>
            <span className="qty-val">{selected.quantity}</span>
            <button className="qty-btn" onClick={() => onQuantityChange(1)}>+</button>
          </div>
        </div>
      </section>
      <section className="detail-section">
        <h2>Tarification</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="config-row">
            <div className="config-row-info">
              <span className="config-row-label">Prix de vente</span>
              <span className="config-row-hint">Prix de vente d'un objet au client</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min="0" step="0.5" className="cost-add-qty" placeholder="0"
                value={sellingPriceInput}
                onChange={(e) => setSellingPriceInput(e.target.value)}
                onBlur={handleSavePricing}
                onKeyDown={(e) => { if (e.key === "Enter") handleSavePricing(); }} />
              <span className="cost-add-unit">€</span>
            </div>
          </div>
          <div className="summary-divider" style={{ margin: "4px 0" }} />
          <div className="config-row">
            <div className="config-row-info">
              <span className="config-row-label">Temps de conception</span>
              <span className="config-row-hint">Heures de design (Fusion 360, modélisation…)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min="0" step="0.5" className="cost-add-qty" placeholder="0"
                value={designTimeInput}
                onChange={(e) => setDesignTimeInput(e.target.value)}
                onBlur={handleSavePricing}
                onKeyDown={(e) => { if (e.key === "Enter") handleSavePricing(); }} />
              <span className="cost-add-unit">h</span>
            </div>
          </div>
          <div className="config-row">
            <div className="config-row-info">
              <span className="config-row-label">Taux horaire conception</span>
              <span className="config-row-hint">Coût de votre heure de design</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min="0" step="1" className="cost-add-qty" placeholder="0"
                value={designRateInput}
                onChange={(e) => setDesignRateInput(e.target.value)}
                onBlur={handleSavePricing}
                onKeyDown={(e) => { if (e.key === "Enter") handleSavePricing(); }} />
              <span className="cost-add-unit">€/h</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
