import { useState, useMemo, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { C, DEFAULT_CONFIG } from "./constants.js";
import { computeLoops, computeRating, exportCsv } from "./computations.js";
import { PRESETS } from "./presets.js";
import { useUrlState } from "./hooks/useUrlState.js";
import Slider from "./components/Slider.jsx";
import StatCard from "./components/StatCard.jsx";
import NumberInput from "./components/NumberInput.jsx";
import DollarInput from "./components/DollarInput.jsx";
import CapitalInput from "./components/CapitalInput.jsx";
import TextInput from "./components/TextInput.jsx";
import CustomTooltip from "./components/CustomTooltip.jsx";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function App() {
  const [cfg, setCfg] = useUrlState(DEFAULT_CONFIG);
  const set = k => v => setCfg(prev => ({ ...prev, [k]: v }));
  const setStr = k => v => setCfg(prev => ({ ...prev, [k]: v }));
  const [selectedLoops, setSelectedLoops] = useState(3);
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();

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

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const loadPreset = (preset) => {
    setCfg(preset.config);
    setSelectedLoops(3);
  };

  const actionBtn = (label, onClick, activeColor) => (
    <button onClick={onClick} style={{
      background: C.bg, border: "1px solid " + (activeColor || C.border),
      borderRadius: 2, padding: "6px 14px", fontSize: 11,
      color: activeColor || C.dim, cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
    }}>{label}</button>
  );

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: C.bg, minHeight: "100vh", color: C.text, padding: isMobile ? "16px 12px" : "28px 20px", overflowX: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, boxShadow: "0 0 10px " + C.accent }} />
              <span style={{ fontSize: 11, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>{cfg.loopChain} · Lending Loop Optimizer</span>
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>{cfg.strategyName}</h1>
            <p style={{ color: C.dim, fontSize: 12, margin: "5px 0 0" }}>
              Beat {cfg.benchmarkApy}% {cfg.benchmarkLabel} · Adjust parameters to find peak efficiency
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={handleCopyLink} style={{
              background: copied ? C.green + "22" : C.bg,
              border: "1px solid " + (copied ? C.green : C.border),
              borderRadius: 2, padding: "6px 14px", fontSize: 11,
              color: copied ? C.green : C.dim, cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
            }}>{copied ? "✓ Copied!" : "⎘ Share Link"}</button>
            {actionBtn("↓ Export CSV", () => exportCsv(loopData, cfg))}
            {actionBtn("↺ Reset", () => { setCfg(DEFAULT_CONFIG); setSelectedLoops(3); })}
          </div>
        </div>

        {/* Preset bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>Presets:</span>
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => loadPreset(p)} style={{
              background: cfg.strategyName === p.config.strategyName ? C.accent + "22" : C.bg,
              border: "1px solid " + (cfg.strategyName === p.config.strategyName ? C.accent : C.border),
              borderRadius: 2, padding: "4px 12px", fontSize: 11,
              color: cfg.strategyName === p.config.strategyName ? C.accent : C.dim,
              cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
            }}>{p.name}</button>
          ))}
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
        <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
              LOOP SELECTOR — PIN DEPTH
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {loopData.map(d => (
                <button key={d.loops} onClick={() => setSelectedLoops(d.loops)} style={{
                  padding: "4px 10px", borderRadius: 2, fontSize: 11, fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                  background: selectedLoops === d.loops ? C.green + "22" : C.bg,
                  border: "1px solid " + (selectedLoops === d.loops ? C.green : C.border),
                  color: selectedLoops === d.loops ? C.green : C.dim,
                }}>{d.loops}{d.loops === optimalLoop.loops ? "★" : ""}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10 }}>
            {[
              { label: cfg.collateralAsset + " Supply Income", value: "+$" + collateralIncome.toLocaleString(), sub: cfg.collateralSupplyApy + "% on $" + (selected.totalSupplied - selected.lastBorrow).toLocaleString(), color: C.green },
              { label: cfg.exitAsset + " Exit Income", value: "+$" + exitIncome.toLocaleString(), sub: cfg.exitSupplyApy + "% on $" + selected.lastBorrow.toLocaleString(), color: C.green },
              { label: cfg.borrowAsset + " Borrow Cost", value: "-$" + borrowCostDollar.toLocaleString(), sub: cfg.borrowApy + "% on $" + selected.totalBorrowed.toLocaleString(), color: C.red },
              { label: "Net Annual Income", value: "$" + annualIncome.toLocaleString(), sub: selected.netApy.toFixed(2) + "% APY on $" + cfg.capital.toLocaleString(), color: selected.netApy >= cfg.benchmarkApy ? C.green : C.amber },
              { label: "vs Benchmark", value: (annualVsBenchmark >= 0 ? "+" : "") + "$" + annualVsBenchmark.toLocaleString(), sub: (selected.netApy - cfg.benchmarkApy).toFixed(2) + "% difference", color: annualVsBenchmark >= 0 ? C.green : C.red },
            ].map(item => (
              <div key={item.label} style={{ background: C.bg, border: "1px solid " + C.border, borderRadius: 2, padding: "10px 12px" }}>
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
                  {steps.map(s => (
                    <div key={s.loop} style={{
                      background: C.bg, borderRadius: 2,
                      padding: isMobile ? "8px 10px" : "8px 14px",
                      border: "1px solid " + (s.loop === selectedLoops ? C.green + "66" : C.border),
                    }}>
                      {isMobile ? (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: C.dim, letterSpacing: "0.06em" }}>LOOP {s.loop}</span>
                            {s.loop === selectedLoops && <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>EXIT</span>}
                          </div>
                          <div style={{ fontSize: 11, fontFamily: "monospace", marginBottom: 3 }}>
                            Supply <span style={{ color: C.accent }}>${s.supplied.toLocaleString()}</span>
                            <span style={{ color: C.dim }}> → </span>
                            Borrow <span style={{ color: C.amber }}>${s.borrow.toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: 10, color: s.loop === selectedLoops ? C.green : C.muted, fontStyle: s.loop === selectedLoops ? "normal" : "italic" }}>↳ {s.action}</div>
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ minWidth: 60, fontSize: 11, color: C.dim }}>Loop {s.loop}</div>
                          <div style={{ minWidth: 130, fontSize: 11, fontFamily: "monospace" }}>Supply <span style={{ color: C.accent }}>${s.supplied.toLocaleString()}</span></div>
                          <div style={{ fontSize: 14, color: C.dim }}>→</div>
                          <div style={{ minWidth: 140, fontSize: 11, fontFamily: "monospace" }}>Borrow <span style={{ color: C.amber }}>${s.borrow.toLocaleString()}</span></div>
                          <div style={{ fontSize: 14, color: C.dim }}>→</div>
                          <div style={{ flex: 1, fontSize: 11, color: s.loop === selectedLoops ? C.green : C.muted, fontStyle: s.loop === selectedLoops ? "normal" : "italic" }}>{s.action}</div>
                          {s.loop === selectedLoops && <div style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>EXIT</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", gap: 16 }}>

          {/* LEFT — Config */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
              <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.amber, padding: "5px 16px", margin: "-16px -16px 14px -16px" }}>STRATEGY CONFIG</div>
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

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
              <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.green, padding: "5px 16px", margin: "-16px -16px 14px -16px" }}>RATES & PARAMETERS</div>
              <NumberInput label={cfg.collateralAsset + " Native APY"} value={cfg.collateralSupplyApy} onChange={set("collateralSupplyApy")} hint="sUSDe: ~4.7–10% historically" />
              <NumberInput label={cfg.borrowAsset + " Borrow APY"} value={cfg.borrowApy} onChange={set("borrowApy")} hint="Stressed at 2.5%" />
              <NumberInput label={cfg.exitAsset + " Exit APY"} value={cfg.exitSupplyApy} onChange={set("exitSupplyApy")} hint="GHO incentive rate" />
              <NumberInput label="Benchmark APY" value={cfg.benchmarkApy} onChange={set("benchmarkApy")} hint="Target to beat" />
              <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
              <Slider label="E-Mode Max LTV" value={cfg.maxLtv} onChange={set("maxLtv")} min={50} max={95} step={1} />
              <Slider label="Depeg Safety Buffer" value={cfg.safetyBuffer} onChange={set("safetyBuffer")} min={1} max={20} step={1} />
            </div>

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
              <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.accent, padding: "5px 16px", margin: "-16px -16px 14px -16px" }}>CAPITAL</div>
              <CapitalInput value={cfg.capital} onChange={set("capital")} />
            </div>
          </div>

          {/* RIGHT — Chart + Table */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: "18px 16px" }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, background: "#151515", borderBottom: "1px solid " + C.border, padding: "5px 16px", margin: "-18px -16px 16px -16px" }}>
                {isMobile ? "NET APY VS LOOP DEPTH" : <>NET APY VS LOOP DEPTH · ${cfg.capital.toLocaleString()} · {cfg.collateralAsset} → {cfg.borrowAsset} → {cfg.exitAsset}</>}
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

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, background: "#151515", borderBottom: "1px solid " + C.border, padding: "5px 16px", margin: "-16px -16px 12px -16px" }}>
                {isMobile ? "LOOP BREAKDOWN" : <>LOOP BREAKDOWN — {cfg.collateralAsset} → {cfg.borrowAsset} → {cfg.exitAsset}</>}
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
                        <tr key={d.loops} onClick={() => setSelectedLoops(d.loops)} style={{ borderBottom: "1px solid " + C.border, background: isOpt ? "rgba(0,229,160,0.05)" : "transparent", cursor: "pointer" }}>
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
              <div style={{ background: "rgba(0,229,160,0.07)", border: "1px solid rgba(0,229,160,0.25)", borderRadius: 2, padding: "12px 16px", fontSize: 12, color: C.green }}>
                ✦ Beats {cfg.benchmarkApy}% from <strong>loop #{beatsBenchmarkAt.loops}</strong> · Optimal at <strong>loop #{optimalLoop.loops} → {optimalLoop.netApy.toFixed(2)}% APY</strong>
              </div>
            ) : (
              <div style={{ background: "rgba(245,166,35,0.07)", border: "1px solid rgba(245,166,35,0.25)", borderRadius: 2, padding: "12px 16px", fontSize: 12, color: C.amber }}>
                ⚠ Does not beat {cfg.benchmarkApy}% at current parameters. Try raising exit APY, lowering borrow rate, or reducing safety buffer.
              </div>
            )}
          </div>
        </div>

        {/* Strategy Explainer */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 20 }}>
          <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.green, padding: "5px 20px", margin: "-20px -20px 14px -20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>STRATEGY EXPLAINER</span>
            {!isMobile && <span style={{ fontSize: 11, fontWeight: 700 }}>{cfg.strategyName}</span>}
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
          <div style={{ background: C.bg, borderRadius: 2, padding: "10px 14px", fontSize: 11, color: C.dim, borderLeft: "3px solid " + C.green }}>
            <strong style={{ color: C.green }}>Key risks:</strong> {cfg.collateralAsset} depeg · High loop count compresses liquidation margin · {cfg.exitChain !== cfg.loopChain ? "Cross-chain bridge risk · " : ""}{cfg.exitAsset} yield is incentive-driven · Gas cost scales with loops on unwind
          </div>
        </div>

        {/* Risk Rating */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 20 }}>
          <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.accent, padding: "5px 20px", margin: "-20px -20px 16px -20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>STRATEGY RISK RATING</span>
            <span style={{ fontSize: 13, color: rating.overallColor, background: "#000", padding: "1px 10px", fontWeight: 900 }}>{rating.overall}</span>
          </div>
          <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", marginBottom: 16 }}>{rating.overallDesc}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            {rating.factors.map(f => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 10, background: C.bg, borderRadius: 2, padding: "8px 12px", border: "1px solid " + C.border }}>
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
              <div key={r.band} style={{ display: "flex", alignItems: "center", gap: 6, background: C.bg, border: "1px solid " + C.border, borderRadius: 2, padding: "5px 10px", fontSize: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.color }} />
                <span style={{ color: r.color, fontWeight: 700, fontFamily: "monospace" }}>{r.band}</span>
                <span style={{ color: C.dim }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Collateral Stress Test */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 20 }}>
          <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.red, padding: "5px 20px", margin: "-20px -20px 6px -20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>COLLATERAL STRESS TEST</span>
            {!isMobile && <span style={{ fontSize: 9, color: "#000", fontWeight: 700 }}>How far can {cfg.collateralAsset} drop before liquidation?</span>}
          </div>
          <div style={{ fontSize: 11, color: C.dim, marginBottom: 16, fontStyle: "italic" }}>
            Enter your actual Aave position. HF = (collateral × liq. threshold) / total debt.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <DollarInput label="Collateral Value ($)" value={cfg.stressCollateral} onChange={set("stressCollateral")} hint="Total supplied as collateral" />
            <DollarInput label="Total Debt ($)" value={cfg.stressDebt} onChange={set("stressDebt")} hint="All borrowed assets combined" />
            <div>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Liq. Threshold (%)</div>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 6, fontStyle: "italic" }}>E-Mode liq. threshold for {cfg.collateralAsset}</div>
              <input type="text" inputMode="decimal" value={cfg.stressLiqThreshold}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) set("stressLiqThreshold")(v); }}
                style={{ width: "100%", background: C.bg, border: "1px solid " + C.border, borderRadius: 2, padding: "7px 10px", color: C.accent, fontSize: 14, fontFamily: "monospace", fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{
            background: currentHF >= 1.7 ? "rgba(0,229,160,0.07)" : currentHF >= 1.4 ? "rgba(245,166,35,0.07)" : "rgba(255,77,109,0.07)",
            border: "1px solid " + (currentHF >= 1.7 ? C.green : currentHF >= 1.4 ? C.amber : C.red),
            borderRadius: 2, padding: "10px 16px", marginBottom: 14,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 12, color: C.dim }}>Current Health Factor</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Liquidates at {liqDropPct > 0 ? "-" + liqDropPct + "% " + cfg.collateralAsset + " drop" : "already at risk"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: currentHF >= 1.7 ? C.green : currentHF >= 1.4 ? C.amber : C.red }}>{currentHF}</span>
              <span style={{ fontSize: 11, color: C.dim }}>{currentHF >= 1.7 ? "✓ Safe" : currentHF >= 1.4 ? "⚠ Caution" : "🚨 Danger"}</span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
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
                  const col = isLiq || isDanger ? C.red : isCaution ? C.amber : C.green;
                  const status = isLiq ? "🚨 LIQUIDATED" : isDanger ? "🚨 Danger" : isCaution ? "⚠ Caution" : "✓ Safe";
                  return (
                    <tr key={drop} style={{ borderBottom: "1px solid " + C.border, background: drop === 0 ? "rgba(0,212,255,0.05)" : isLiq ? "rgba(255,77,109,0.05)" : "transparent" }}>
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
          </div>

          <div style={{ marginTop: 12, background: C.bg, borderRadius: 2, padding: "10px 14px", fontSize: 11, borderLeft: "3px solid " + C.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: C.dim }}>Liquidation triggered at</span>
            <span style={{ color: C.red, fontFamily: "monospace", fontWeight: 800, fontSize: 14 }}>
              {liqDropPct > 0 ? "-" + liqDropPct + "% " + cfg.collateralAsset + " price drop" : "Already at risk"}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: C.dim, lineHeight: 1.8 }}>
          <div>⚠ For educational purposes only. Not financial advice. DeFi carries significant risk including liquidation and smart contract risk.</div>
          <div style={{ marginTop: 4 }}>
            <a href="https://github.com/sarthak-guleria/fren-labs" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "none" }}>GitHub</a>
            {" · "}MIT License
          </div>
        </div>

      </div>
      <Analytics />
      <SpeedInsights />
    </div>
  );
}
