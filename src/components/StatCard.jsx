import { C } from "../constants.js";

export default function StatCard({ label, value, sub, color = C.green }) {
  return (
    <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 0, flex: 1, minWidth: 130 }}>
      <div style={{ background: "#151515", borderBottom: "1px solid " + C.border, padding: "3px 14px", fontSize: 9, color: C.dim, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>{label}</div>
      <div style={{ padding: "10px 14px" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}
