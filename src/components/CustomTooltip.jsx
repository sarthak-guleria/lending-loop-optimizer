import { C } from "../constants.js";

export default function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "#0d1629", border: "1px solid " + C.border, borderRadius: 8, padding: "12px 16px", fontSize: 12 }}>
      <div style={{ color: C.dim, marginBottom: 8, fontWeight: 600 }}>Loop #{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 4 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: p.color }}>{p.value && p.value.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}
