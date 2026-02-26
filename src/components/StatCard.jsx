import { C } from "../constants.js";

export default function StatCard({ label, value, sub, color = C.green }) {
  return (
    <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: "14px 18px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
