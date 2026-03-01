import { C } from "../constants.js";

export default function TextInput({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <input type="text" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: C.bg, border: "1px solid " + C.border, borderRadius: 0, padding: "6px 10px", color: C.text, fontSize: 12, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}
