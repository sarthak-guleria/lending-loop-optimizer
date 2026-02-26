import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";

const C = {
  bg: "#0a0e1a", panel: "#0f1524", border: "#1e2a40",
  accent: "#00d4ff", green: "#00e5a0", amber: "#f5a623",
  red: "#ff4d6d", muted: "#4a5568", text: "#e2e8f0", dim: "#7a8ba0",
};

const DEFAULT_CONFIG = {
  strategyName: "sUSDe Loop → GHO Exit",
  loopChain: "Mantle", collateralAsset: "sUSDe", borrowAsset: "USDC",
  exitChain: "Mantle", exitAsset: "GHO",
  collateralSupplyApy: 3.50, borrowApy: 2.50, exitSupplyApy: 7.03,
  maxLtv: 90, safetyBuffer: 10,
  capital: 10000,
  benchmarkApy: 7.03, benchmarkLabel: "GHO Direct Supply",
  stressCollateral: 24400, stressDebt: 14400, stressLiqThreshold: 92,
};

function computeRating(cfg) {
  const spread = cfg.collateralSupplyApy - cfg.borrowApy;
  const safeLtv = cfg.maxLtv - cfg.safetyBuffer;
  const isStable = n => ["usd","dai","gho","usdc","usdt","usde","susde","eurc","frax","lusd"].some(s => n.toLowerCase().includes(s));
  const factors = [
    { label: "Collateral Quality", score: isStable(cfg.collateralAsset) ? 2 : 3,
      desc: isStable(cfg.collateralAsset) ? `${cfg.collateralAsset} — yield-bearing stablecoin; depeg risk during stress` : `${cfg.collateralAsset} — non-stable, subject to price swings` },
    { label: "Yield Source Stability", score: cfg.exitSupplyApy > 12 ? 4 : cfg.exitSupplyApy > 8 ? 3 : cfg.exitSupplyApy > 5 ? 2 : 1,
      desc: cfg.exitSupplyApy > 8 ? `${cfg.exitAsset} at ${cfg.exitSupplyApy}% — incentive-driven, variable` : `${cfg.exitAsset} at ${cfg.exitSupplyApy}% — moderate, partially incentive-driven` },
    { label: "Borrow Spread", score: spread > 3 ? 1 : spread > 1.5 ? 2 : spread > 0.5 ? 3 : 4,
      desc: `${cfg.collateralSupplyApy}% supply − ${cfg.borrowApy}% borrow = ${spread.toFixed(2)}% net spread per loop` },
    { label: "Liquidation Risk", score: safeLtv > 85 ? 4 : safeLtv > 75 ? 3 : safeLtv > 65 ? 2 : 1,
      desc: `Safe LTV ${safeLtv}% — ${safeLtv > 80 ? "thin margin, cascade risk at high loop count" : "adequate buffer"}` },
    { label: "Smart Contract Risk", score: cfg.loopChain === cfg.exitChain ? 2 : 3,
      desc: cfg.loopChain === cfg.exitChain ? `Single chain (${cfg.loopChain}) — no bridge exposure` : `Cross-chain (${cfg.loopChain} → ${cfg.exitChain}) — bridge risk` },
    { label: "Unwind Ease", score: cfg.loopChain === cfg.exitChain ? 2 : 3,
      desc: cfg.loopChain === cfg.exitChain ? "Same chain — repay loops in sequence" : `Must bridge back ${cfg.exitChain} → ${cfg.loopChain} to unwind` },
  ];
  const avg = factors.reduce((s, f) => s + f.score, 0) / factors.length;
  const BANDS = [
    { max: 1.5, rating: "Aa2", color: C.green, desc: "High quality · Low credit risk" },
    { max: 2.0, rating: "Baa1", color: C.accent, desc: "Investment grade · Moderate risk" },
    { max: 2.5, rating: "Baa3", color: C.accent, desc: "Investment grade · Some speculative elements" },
    { max: 3.0, rating: "Ba2", color: C.amber, desc: "Speculative grade · Substantial risk" },
    { max: 3.5, rating: "Ba3", color: C.amber, desc: "Speculative · High vulnerability" },
    { max: 4.0, rating: "B2", color: C.red, desc: "Speculative · Subject to high risk" },
  ];
  const SL = ["", "Aa3", "Baa2", "Ba2", "B2"];
  const SC = ["", C.green, C.accent, C.amber, C.red];
  const band = BANDS.find(b => avg <= b.max) || BANDS[BANDS.length - 1];
  return { factors: factors.map(f => ({ ...f, rating: SL[f.score], color: SC[f.score] })), overall: band.rating, overallColor: band.color, overallDesc: band.desc };
}

function computeLoops(cfg) {
  const { capital, collateralSupplyApy, borrowApy, exitSupplyApy, maxLtv, safetyBuffer } = cfg;
  const safeLtv = Math.max(0, maxLtv - safetyBuffer) / 100;
  return Array.from({ length: 11 }, (_, loops) => {
    let totalSupplied, totalBorrowed;
    if (safeLtv >= 1) { totalSupplied = capital * (loops + 1); totalBorrowed = capital * loops; }
    else { totalSupplied = capital * (1 - Math.pow(safeLtv, loops + 1)) / (1 - safeLtv); totalBorrowed = totalSupplied - capital; }
    const lastBorrow = loops > 0 ? capital * Math.pow(safeLtv, loops) : 0;
    const supplyIncome = (totalSupplied - lastBorrow) * (collateralSupplyApy / 100) + lastBorrow * (exitSupplyApy / 100);
    const borrowCost = totalBorrowed * (borrowApy / 100);
    const netApy = ((supplyIncome - borrowCost) / capital) * 100;
    return { loops, netApy: +netApy.toFixed(3), totalSupplied: +totalSupplied.toFixed(2), totalBorrowed: +totalBorrowed.toFixed(2), safeLtvUsed: +(safeLtv * 100).toFixed(1), lastBorrow: +lastBorrow.toFixed(2) };
  });
}

function Slider({ label, value, onChange, min, max, step = 1, unit = "%" }) {
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

function TextInput({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <input type="text" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: C.bg, border: "1px solid " + C.border, borderRadius: 6, padding: "6px 10px", color: C.text, fontSize: 12, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

function NumberInput({ label, value, onChange, hint }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  const handleChange = (e) => {
    const v = e.target.value;
    const isValid = v === "" || v === "." || v.split(".").length <= 2 && v.replace(".", "").split("").every(c => c >= "0" && c <= "9");
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
          style={{ width: "100%", background: C.bg, border: "1px solid " + (focused ? C.accent : C.border), borderRadius: 6, padding: "7px 36px 7px 10px", color: C.accent, fontSize: 14, fontFamily: "monospace", fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
        <span style={{ position: "absolute", right: 10, fontSize: 13, color: C.dim, pointerEvents: "none" }}>%</span>
      </div>
    </div>
  );
}

function DollarInput({ label, value, onChange, hint }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

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

function CapitalInput({ value, onChange }) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const parse = v => { const n = parseFloat(v.replace(/,/g, "")); return isNaN(n) ? null : Math.max(1, n); };
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

function StatCard({ label, value, sub, color = C.green }) {
  return (
    <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: "14px 18px", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
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
};

export default function App() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const set = k => v => setCfg(prev => ({ ...prev, [k]: v }));
  const setStr = k => v => setCfg(prev => ({ ...prev, [k]: v }));
  const [selectedLoops, setSelectedLoops] = useState(3);

  const loopData = useMemo(() => computeLoops(cfg), [cfg]);
  const rating = useMemo(() => computeRating(cfg), [cfg]);
  const spread = +(cfg.collateralSupplyApy - cfg.borrowApy).toFixed(2);
  const optimalLoop = loopData.reduce((best, d) => d.netApy > best.netApy ? d : best, loopData[0]);
  const beatsBenchmarkAt = loopData.find(d => d.netApy >= cfg.benchmarkApy);
  const selected = loopData.find(d => d.loops === selectedLoops) || loopData[0];

  const annualIncome = +(cfg.capital * selected.netApy / 100).toFixed(2);
  const annualVsBenchmark = +(cfg.capital * (selected.netApy - cfg.benchmarkApy) / 100).toFixed(2);
  const collateralIncome = +((selected.totalSupplied - selected.lastBorrow) * cfg.collateralSupplyApy / 100).toFixed(2);
  const exitIncome = +(selected.lastBorrow * cfg.exitSupplyApy / 100).toFixed(2);
  const borrowCostDollar = +(selected.totalBorrowed * cfg.borrowApy / 100).toFixed(2);

  const loopKey = cfg.collateralAsset + " Loop APY";
  const benchKey = "Benchmark (" + cfg.benchmarkLabel + ")";
  const chartData = loopData.map(d => {
    const row = { loops: d.loops };
    row[loopKey] = d.netApy;
    row[benchKey] = cfg.benchmarkApy;
    return row;
  });

  // Stress test
  const liqThresh = cfg.stressLiqThreshold / 100;
  const currentHF = cfg.stressDebt > 0 ? +((cfg.stressCollateral * liqThresh) / cfg.stressDebt).toFixed(3) : 999;
  const liqDropPct = cfg.stressDebt > 0 ? +((1 - cfg.stressDebt / (cfg.stressCollateral * liqThresh)) * 100).toFixed(2) : 0;
  const depegLevels = [0, -1, -2, -3, -5, -7, -10, -15, -20, -25, -30];

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: C.bg, minHeight: "100vh", color: C.text, padding: "28px 20px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, boxShadow: "0 0 10px " + C.accent }} />
            <span style={{ fontSize: 11, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>{cfg.loopChain} · Lending Loop Optimizer</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>{cfg.strategyName}</h1>
          <p style={{ color: C.dim, fontSize: 12, margin: "5px 0 0" }}>Beat {cfg.benchmarkApy}% {cfg.benchmarkLabel} · Adjust parameters to find peak efficiency</p>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <StatCard label="Selected Loop APY" value={selected.netApy.toFixed(2) + "%"}
            sub={selectedLoops + " loops · $" + selected.totalSupplied.toLocaleString() + " deployed"}
            color={selected.netApy >= cfg.benchmarkApy ? C.green : C.amber} />
          <StatCard label="Est. Annual Income" value={"$" + annualIncome.toLocaleString()}
            sub={(annualVsBenchmark >= 0 ? "+" : "") + "$" + annualVsBenchmark.toLocaleString() + " vs benchmark"}
            color={annualVsBenchmark >= 0 ? C.green : C.red} />
          <StatCard label="Loop Spread" value={spread + "%"}
            sub={cfg.collateralSupplyApy + "% supply − " + cfg.borrowApy + "% borrow"}
            color={spread > 2 ? C.green : spread > 1 ? C.amber : C.red} />
          <StatCard label="Risk Rating" value={rating.overall} sub={rating.overallDesc} color={rating.overallColor} />
        </div>

        {/* Loop selector + dollar breakdown */}
        <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>Loop Selector · Pin a depth to see exact dollar breakdown</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {loopData.map(d => (
                <button key={d.loops} onClick={() => setSelectedLoops(d.loops)}
                  style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                    background: selectedLoops === d.loops ? C.green + "22" : C.bg,
                    border: "1px solid " + (selectedLoops === d.loops ? C.green : C.border),
                    color: selectedLoops === d.loops ? C.green : C.dim }}>
                  {d.loops}{d.loops === optimalLoop.loops ? "★" : ""}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {[
              { label: cfg.collateralAsset + " Supply Income", value: "+$" + collateralIncome.toLocaleString(), sub: cfg.collateralSupplyApy + "% on $" + (selected.totalSupplied - selected.lastBorrow).toLocaleString(), color: C.green },
              { label: cfg.exitAsset + " Exit Income", value: "+$" + exitIncome.toLocaleString(), sub: cfg.exitSupplyApy + "% on $" + selected.lastBorrow.toLocaleString(), color: C.green },
              { label: cfg.borrowAsset + " Borrow Cost", value: "-$" + borrowCostDollar.toLocaleString(), sub: cfg.borrowApy + "% on $" + selected.totalBorrowed.toLocaleString(), color: C.red },
              { label: "Net Annual Income", value: "$" + annualIncome.toLocaleString(), sub: selected.netApy.toFixed(2) + "% APY on $" + cfg.capital.toLocaleString(), color: selected.netApy >= cfg.benchmarkApy ? C.green : C.amber },
              { label: "vs Benchmark", value: (annualVsBenchmark >= 0 ? "+" : "") + "$" + annualVsBenchmark.toLocaleString(), sub: (selected.netApy - cfg.benchmarkApy).toFixed(2) + "% difference", color: annualVsBenchmark >= 0 ? C.green : C.red },
            ].map(item => (
              <div key={item.label} style={{ background: C.bg, border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 5, lineHeight: 1.4 }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: item.color, fontFamily: "monospace" }}>{item.value}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{item.sub}</div>
              </div>
            ))}
          </div>

          {/* Per-loop borrow guide */}
          {selectedLoops > 0 && (() => {
            const safeLtv = Math.max(0, cfg.maxLtv - cfg.safetyBuffer) / 100;
            const steps = [];
            let supplied = cfg.capital;
            for (let i = 1; i <= selectedLoops; i++) {
              const borrow = +(supplied * safeLtv).toFixed(2);
              const isLast = i === selectedLoops;
              steps.push({ loop: i, supplied: +supplied.toFixed(2), borrow, action: isLast ? "swap → " + cfg.exitAsset + ", supply" : "swap → " + cfg.collateralAsset + ", re-supply" });
              supplied = borrow;
            }
            return (
              <div style={{ marginTop: 14, borderTop: "1px solid " + C.border, paddingTop: 14 }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  Per-Loop Borrow Guide · Safe LTV {(safeLtv * 100).toFixed(0)}% · Capital ${cfg.capital.toLocaleString()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {steps.map((s) => (
                    <div key={s.loop} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, borderRadius: 7, padding: "8px 14px", border: "1px solid " + (s.loop === selectedLoops ? C.green + "66" : C.border) }}>
                      <div style={{ minWidth: 60, fontSize: 11, color: C.dim }}>Loop {s.loop}</div>
                      <div style={{ minWidth: 130, fontSize: 11, fontFamily: "monospace" }}>Supply <span style={{ color: C.accent }}>${s.supplied.toLocaleString()}</span></div>
                      <div style={{ fontSize: 14, color: C.dim }}>→</div>
                      <div style={{ minWidth: 140, fontSize: 11, fontFamily: "monospace" }}>Borrow <span style={{ color: C.amber }}>${s.borrow.toLocaleString()}</span></div>
                      <div style={{ fontSize: 14, color: C.dim }}>→</div>
                      <div style={{ flex: 1, fontSize: 11, color: s.loop === selectedLoops ? C.green : C.muted, fontStyle: s.loop === selectedLoops ? "normal" : "italic" }}>{s.action}</div>
                      {s.loop === selectedLoops && <div style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>EXIT</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>

          {/* LEFT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>⚙ Strategy Config</div>
              <TextInput label="Strategy Name" value={cfg.strategyName} onChange={setStr("strategyName")} placeholder="My Loop Strategy" />
              <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>Loop Leg</div>
              <TextInput label="Chain" value={cfg.loopChain} onChange={setStr("loopChain")} placeholder="e.g. Mantle" />
              <TextInput label="Collateral Asset" value={cfg.collateralAsset} onChange={setStr("collateralAsset")} placeholder="e.g. sUSDe" />
              <TextInput label="Borrow Asset" value={cfg.borrowAsset} onChange={setStr("borrowAsset")} placeholder="e.g. USDC" />
              <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>Exit Leg</div>
              <TextInput label="Exit Chain" value={cfg.exitChain} onChange={setStr("exitChain")} placeholder="e.g. Mantle" />
              <TextInput label="Exit Asset" value={cfg.exitAsset} onChange={setStr("exitAsset")} placeholder="e.g. GHO" />
              <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
              <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>Benchmark</div>
              <TextInput label="Benchmark Label" value={cfg.benchmarkLabel} onChange={setStr("benchmarkLabel")} placeholder="e.g. GHO Direct" />
            </div>

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 10, color: C.green, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>⚡ Rates & Parameters</div>
              <NumberInput label={cfg.collateralAsset + " Native APY"} value={cfg.collateralSupplyApy} onChange={set("collateralSupplyApy")} hint="sUSDe: ~4.7–10% historically" />
              <NumberInput label={cfg.borrowAsset + " Borrow APY"} value={cfg.borrowApy} onChange={set("borrowApy")} hint="Stressed at 2.5%" />
              <NumberInput label={cfg.exitAsset + " Exit APY"} value={cfg.exitSupplyApy} onChange={set("exitSupplyApy")} hint="GHO incentive rate" />
              <NumberInput label="Benchmark APY" value={cfg.benchmarkApy} onChange={set("benchmarkApy")} hint="Target to beat" />
              <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
              <Slider label="E-Mode Max LTV" value={cfg.maxLtv} onChange={set("maxLtv")} min={50} max={95} step={1} />
              <Slider label="Depeg Safety Buffer" value={cfg.safetyBuffer} onChange={set("safetyBuffer")} min={1} max={20} step={1} />
            </div>

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 10, color: C.amber, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>$ Capital</div>
              <CapitalInput value={cfg.capital} onChange={set("capital")} />
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: "18px 16px" }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
                Net APY vs Loop Depth · ${cfg.capital.toLocaleString()} · {cfg.collateralAsset} → {cfg.borrowAsset} → {cfg.exitAsset}
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 28, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="loops" tick={{ fill: C.dim, fontSize: 11 }} label={{ value: "Loops", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }} />
                  <YAxis tick={{ fill: C.dim, fontSize: 11 }} tickFormatter={v => v.toFixed(1) + "%"} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  <ReferenceLine y={cfg.benchmarkApy} stroke={C.amber} strokeDasharray="6 3" label={{ value: cfg.benchmarkApy + "%", fill: C.amber, fontSize: 10, position: "insideTopRight" }} />
                  <Line type="monotone" dataKey={loopKey} stroke={C.green} strokeWidth={2.5} dot={{ fill: C.green, r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey={benchKey} stroke={C.amber} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                Loop Breakdown — {cfg.collateralAsset} → {cfg.borrowAsset} → exit to {cfg.exitAsset}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid " + C.border }}>
                      {["Loops", "Safe LTV", "Total Supplied", "Total Borrowed", "Exit → " + cfg.exitAsset, "Net APY", "vs Benchmark"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", color: C.dim, fontWeight: 600, textAlign: "right", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loopData.map(d => {
                      const isOpt = d.loops === optimalLoop.loops;
                      const beats = d.netApy >= cfg.benchmarkApy;
                      const diff = d.netApy - cfg.benchmarkApy;
                      return (
                        <tr key={d.loops} style={{ borderBottom: "1px solid " + C.border, background: isOpt ? "rgba(0,229,160,0.05)" : "transparent" }}>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: isOpt ? C.green : C.text, fontWeight: isOpt ? 700 : 400 }}>{d.loops}{isOpt ? " ★" : ""}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: C.dim }}>{d.safeLtvUsed}%</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "monospace" }}>${d.totalSupplied.toLocaleString()}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: C.muted, fontFamily: "monospace" }}>${d.totalBorrowed.toLocaleString()}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: "#a78bfa", fontFamily: "monospace" }}>${d.lastBorrow.toLocaleString()}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: beats ? C.green : C.amber, fontFamily: "monospace", fontWeight: 700 }}>{d.netApy.toFixed(2)}%</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: diff >= 0 ? C.green : C.red, fontFamily: "monospace", fontSize: 11 }}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {beatsBenchmarkAt ? (
              <div style={{ background: "rgba(0,229,160,0.07)", border: "1px solid rgba(0,229,160,0.25)", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: C.green }}>
                ✦ Beats {cfg.benchmarkApy}% from <strong>loop #{beatsBenchmarkAt.loops}</strong> · Optimal at <strong>loop #{optimalLoop.loops} → {optimalLoop.netApy.toFixed(2)}% APY</strong>
              </div>
            ) : (
              <div style={{ background: "rgba(245,166,35,0.07)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: C.amber }}>
                ⚠ Does not beat {cfg.benchmarkApy}% at current parameters. Try raising exit APY, lowering borrow rate, or reducing safety buffer.
              </div>
            )}
          </div>
        </div>

        {/* Strategy Explainer */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid #1a3d30", borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 6, height: 36, borderRadius: 3, background: C.green }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{cfg.strategyName}</div>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>{cfg.collateralAsset} Loop on {cfg.loopChain} → Exit to {cfg.exitAsset} on {cfg.exitChain}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.9, marginBottom: 14 }}>
            {[
              "Convert capital to " + cfg.collateralAsset + " and supply on " + cfg.loopChain + " (" + cfg.collateralSupplyApy + "% native APY)",
              "Borrow " + cfg.borrowAsset + " at " + cfg.borrowApy + "% using E-Mode (" + cfg.maxLtv + "% max LTV → " + (cfg.maxLtv - cfg.safetyBuffer) + "% safe with " + cfg.safetyBuffer + "% buffer)",
              "Swap borrowed " + cfg.borrowAsset + " → " + cfg.collateralAsset + " and re-supply — repeat for N loops",
              "On final loop: swap last borrow → " + cfg.exitAsset + (cfg.exitChain !== cfg.loopChain ? ", bridge to " + cfg.exitChain : "") + ", supply at " + cfg.exitSupplyApy + "%",
              "Net spread per loop: " + spread + "% (" + cfg.collateralSupplyApy + "% supply − " + cfg.borrowApy + "% borrow)",
            ].map((txt, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                <span style={{ color: C.green, fontWeight: 700, minWidth: 16 }}>{i + 1}.</span>
                <span style={{ color: C.text }}>{txt}</span>
              </div>
            ))}
          </div>
          <div style={{ background: C.bg, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: C.dim, borderLeft: "3px solid " + C.green }}>
            <strong style={{ color: C.green }}>Key risks:</strong> {cfg.collateralAsset} depeg · High loop count compresses liquidation margin · {cfg.exitChain !== cfg.loopChain ? "Cross-chain bridge risk · " : ""}{cfg.exitAsset} yield is incentive-driven · Gas cost scales with loops on unwind
          </div>
        </div>

        {/* Risk Rating */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700 }}>◈ Strategy Risk Rating</div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <div style={{ background: rating.overallColor + "22", border: "1px solid " + rating.overallColor, borderRadius: 6, padding: "4px 16px", fontSize: 18, fontWeight: 900, color: rating.overallColor, fontFamily: "monospace" }}>{rating.overall}</div>
          </div>
          <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", marginBottom: 16 }}>{rating.overallDesc}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {rating.factors.map(f => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, borderRadius: 7, padding: "8px 12px", border: "1px solid " + C.border }}>
                <div style={{ minWidth: 42, fontSize: 12, fontWeight: 800, color: f.color, fontFamily: "monospace", textAlign: "center" }}>{f.rating}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{f.label}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{f.desc}</div>
                </div>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", borderTop: "1px solid " + C.border, paddingTop: 14 }}>
            {[
              { band: "Aaa–Aa", label: "Investment Grade · Minimal Risk", color: C.green },
              { band: "A–Baa", label: "Investment Grade · Moderate Risk", color: C.accent },
              { band: "Ba–B", label: "Speculative · Substantial Risk", color: C.amber },
              { band: "Caa–C", label: "High Risk / Near Default", color: C.red },
            ].map(r => (
              <div key={r.band} style={{ display: "flex", alignItems: "center", gap: 6, background: C.bg, border: "1px solid " + C.border, borderRadius: 6, padding: "5px 10px", fontSize: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.color }} />
                <span style={{ color: r.color, fontWeight: 700, fontFamily: "monospace" }}>{r.band}</span>
                <span style={{ color: C.dim }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Collateral Stress Test */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: C.red, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700 }}>⚡ Collateral Stress Test — Real Position</div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <div style={{ fontSize: 10, color: C.dim }}>How far can {cfg.collateralAsset} drop before liquidation?</div>
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 16, fontStyle: "italic" }}>
            Enter your actual Aave position. HF = (collateral × liq. threshold) / total debt.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <DollarInput label="Collateral Value ($)" value={cfg.stressCollateral} onChange={set("stressCollateral")} hint="Total supplied as collateral" />
            <DollarInput label="Total Debt ($)" value={cfg.stressDebt} onChange={set("stressDebt")} hint="All borrowed assets combined" />
            <div>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Liq. Threshold (%)</div>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 6, fontStyle: "italic" }}>From Aave E-Mode (92% for sUSDe)</div>
              <input type="text" inputMode="decimal" value={cfg.stressLiqThreshold}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) set("stressLiqThreshold")(v); }}
                style={{ width: "100%", background: C.bg, border: "1px solid " + C.border, borderRadius: 6, padding: "7px 10px", color: C.accent, fontSize: 14, fontFamily: "monospace", fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Current HF banner */}
          <div style={{ background: currentHF >= 1.7 ? "rgba(0,229,160,0.07)" : currentHF >= 1.4 ? "rgba(245,166,35,0.07)" : "rgba(255,77,109,0.07)",
            border: "1px solid " + (currentHF >= 1.7 ? C.green : currentHF >= 1.4 ? C.amber : C.red),
            borderRadius: 8, padding: "10px 16px", marginBottom: 14,
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, color: C.dim }}>Current Health Factor</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Liquidates at {liqDropPct > 0 ? "-" + liqDropPct + "% " + cfg.collateralAsset + " drop" : "already at risk"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: currentHF >= 1.7 ? C.green : currentHF >= 1.4 ? C.amber : C.red }}>{currentHF}</span>
              <span style={{ fontSize: 11, color: C.dim }}>{currentHF >= 1.7 ? "✓ Safe" : currentHF >= 1.4 ? "⚠ Caution" : "🚨 Danger"}</span>
            </div>
          </div>

          {/* Stress table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid " + C.border }}>
                {[cfg.collateralAsset + " Price Drop", "Collateral Value", "Debt", "Health Factor", "Status", "Buffer Remaining"].map(h => (
                  <th key={h} style={{ padding: "6px 12px", color: C.dim, fontWeight: 600, textAlign: "right", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depegLevels.map(drop => {
                const collateral = +(cfg.stressCollateral * (1 + drop / 100)).toFixed(2);
                const hf = cfg.stressDebt > 0 ? +((collateral * liqThresh) / cfg.stressDebt).toFixed(3) : 999;
                const bufferToLiq = +(((hf - 1) / hf) * 100).toFixed(1);
                const isLiq = hf < 1.0;
                const isDanger = hf < 1.4;
                const isCaution = hf < 1.7;
                const isCurrent = drop === 0;
                const col = isLiq ? C.red : isDanger ? C.red : isCaution ? C.amber : C.green;
                const status = isLiq ? "🚨 LIQUIDATED" : isDanger ? "🚨 Danger" : isCaution ? "⚠ Caution" : "✓ Safe";
                return (
                  <tr key={drop} style={{ borderBottom: "1px solid " + C.border, background: isCurrent ? "rgba(0,212,255,0.05)" : isLiq ? "rgba(255,77,109,0.05)" : "transparent" }}>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: drop === 0 ? C.accent : C.red, fontFamily: "monospace", fontWeight: drop === 0 ? 700 : 400 }}>{drop === 0 ? "Current (0%)" : drop + "%"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace" }}>${collateral.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: C.muted }}>${cfg.stressDebt.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: col }}>{hf}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: col, fontSize: 11 }}>{status}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: isLiq ? C.red : C.dim, fontSize: 11 }}>{isLiq ? "—" : bufferToLiq + "% drop remaining"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 12, background: C.bg, borderRadius: 8, padding: "10px 14px", fontSize: 11, borderLeft: "3px solid " + C.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: C.dim }}>Liquidation triggered at</span>
            <span style={{ color: C.red, fontFamily: "monospace", fontWeight: 800, fontSize: 14 }}>
              {liqDropPct > 0 ? "-" + liqDropPct + "% " + cfg.collateralAsset + " price drop" : "Already at risk"}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
