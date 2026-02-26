import { useState, useEffect } from "react";
import { C } from "../constants.js";

export default function CapitalInput({ value, onChange }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const parse = v => {
    const n = parseFloat(v.replace(/,/g, ""));
    return isNaN(n) ? null : Math.max(1, n);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.dim, letterSpacing: "0.07em", textTransform: "uppercase" }}>Starting Capital</span>
        <span style={{ fontSize: 10, color: C.muted }}>no max</span>
      </div>
      <input type="text" inputMode="decimal"
        value={focused ? raw : "$" + Number(value).toLocaleString()}
        onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ""); setRaw(v); const n = parse(v); if (n !== null) onChange(n); }}
        onFocus={() => { setFocused(true); setRaw(String(value)); }}
        onBlur={() => { setFocused(false); const n = parse(raw); if (!n) { setRaw("500"); onChange(500); } else { setRaw(n.toLocaleString()); onChange(n); } }}
        style={{ width: "100%", background: C.bg, border: "1px solid " + (focused ? C.amber : C.border), borderRadius: 6, padding: "9px 12px", color: C.amber, fontSize: 18, fontFamily: "monospace", fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {[500, 1000, 2600, 5000, 10000, 50000].map(v => (
          <button key={v} onClick={() => { onChange(v); setRaw(String(v)); }}
            style={{ background: value === v ? C.amber + "22" : C.bg, border: "1px solid " + (value === v ? C.amber : C.border), borderRadius: 5, padding: "3px 8px", fontSize: 10, color: value === v ? C.amber : C.dim, cursor: "pointer", fontFamily: "monospace", fontWeight: 600 }}>
            ${v >= 1000 ? (v / 1000) + "k" : v}
          </button>
        ))}
      </div>
    </div>
  );
}
