import { C } from "../constants.js";

export default function Slider({ label, value, onChange, min, max, step = 1, unit = "%" }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.dim, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontSize: 13, color: C.accent, fontFamily: "monospace", fontWeight: 700 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.accent, cursor: "pointer" }} />
    </div>
  );
}
