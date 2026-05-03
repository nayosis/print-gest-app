import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  disabled?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Ferme sur clic extérieur ou Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Évite que le menu sorte de l'écran
  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(y, window.innerHeight - 120),
    left: Math.min(x, window.innerWidth - 220),
  };

  return (
    <div ref={ref} className="context-menu" style={style}>
      {items.map((item, i) => (
        <button
          key={i}
          className={`context-menu-item ${item.disabled ? "disabled" : ""}`}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
        >
          {item.icon && <span className="context-menu-icon">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
