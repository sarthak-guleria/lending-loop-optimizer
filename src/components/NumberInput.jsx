import { useState, useEffect } from "react";
import { C } from "../constants.js";

export default function NumberInput({ label, value, onChange, hint }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Sync raw when value changes externally (preset load, reset)
  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  const handleChange = (e) => {
    const v = e.target.value;
    const isValid =
      v === "" || v === "." ||
      (v.split(".").length <= 2 && v.replace(".", "").split("").every(c => c >= "0" && c <= "9"));
    if (isValid) {
      setRaw(v);
      const num = parseFloat(v);
      if (!isNaN(num) && num >= 0 && num <= 200) onChange(num);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const num = parseFloat(raw);
    if (isNaN(num) || num < 0) { setRaw("0"); onChange(0); }
    else if (num > 200) { setRaw("200"); onChange(200); }
    else setRaw(String(num));
  };

  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.dim, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
        {hint && !focused && <span style={{ fontSize: 9, color: C.muted, fontStyle: "italic", maxWidth: 120, textAlign: "right" }}>{hint}</span>}
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input type="text" inputMode="decimal"
          value={focused ? raw : String(value)}
          onChange={handleChange}
          onFocus={() => { setFocused(true); setRaw(String(value)); }}
          onBlur={handleBlur}
          style={{ width: "100%", background: C.bg, border: "1px solid " + (focused ? C.accent : C.border), borderRadius: 0, padding: "7px 36px 7px 10px", color: C.accent, fontSize: 14, fontFamily: "monospace", fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
        <span style={{ position: "absolute", right: 10, fontSize: 13, color: C.dim, pointerEvents: "none" }}>%</span>
      </div>
    </div>
  );
}
