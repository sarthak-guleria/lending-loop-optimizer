import { useState, useEffect } from "react";
import { C } from "../constants.js";

export default function DollarInput({ label, value, onChange, hint }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const handleChange = (e) => {
    const v = e.target.value.replace(/[^0-9.]/g, "");
    setRaw(v);
    const n = parseFloat(v);
    if (!isNaN(n) && n >= 0) onChange(n);
  };

  const handleBlur = () => {
    setFocused(false);
    const n = parseFloat(raw);
    if (isNaN(n) || n < 0) { setRaw("0"); onChange(0); }
    else setRaw(String(n));
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        {hint && <span style={{ fontSize: 9, color: C.muted, fontStyle: "italic" }}>{hint}</span>}
      </div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim, fontSize: 13, pointerEvents: "none" }}>$</span>
        <input type="text" inputMode="decimal"
          value={focused ? raw : Number(value).toLocaleString()}
          onChange={handleChange}
          onFocus={() => { setFocused(true); setRaw(String(value)); }}
          onBlur={handleBlur}
          style={{ width: "100%", background: C.bg, border: "1px solid " + (focused ? C.accent : C.border), borderRadius: 6, padding: "7px 10px 7px 24px", color: C.accent, fontSize: 14, fontFamily: "monospace", fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
      </div>
    </div>
  );
}
