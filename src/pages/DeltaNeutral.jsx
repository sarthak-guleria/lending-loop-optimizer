import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { C } from "../constants.js";
import { useUrlState } from "../hooks/useUrlState.js";
import StatCard from "../components/StatCard.jsx";
import NumberInput from "../components/NumberInput.jsx";
import Slider from "../components/Slider.jsx";
import CapitalInput from "../components/CapitalInput.jsx";
import CustomTooltip from "../components/CustomTooltip.jsx";
import {
  MARKETS, computeCarry, computeScenarios, computeLevStress,
  getSignalLabel, closestScenarioIndex, computeDnRating,
  computeMarketRec, computeAllRecs, getActionStyle,
} from "../dnComputations.js";

// ─── Signal display map ──────────────────────────────────────────────────────

const SIGNAL = {
  "exit":      { label: "EXIT",      color: C.red },
  "low":       { label: "LOW",       color: C.amber },
  "moderate":  { label: "MODERATE",  color: C.green },
  "strong":    { label: "STRONG",    color: C.green },
  "very-high": { label: "VERY HIGH", color: C.green },
  "spike":     { label: "SPIKE",     color: C.amber },
};

// ─── Default config ──────────────────────────────────────────────────────────

const DEFAULT_DN = {
  market:             "ETH",
  capital:            10000,
  mode:               "standard",
  leverage:           2,
  borrowRate:         5,
  stressCollateral:   20000,
  stressDebt:         10000,
  stressLiqThreshold: 85,
};

// ─── Hyperliquid API ─────────────────────────────────────────────────────────

async function fetchLiveRates() {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  const [meta, ctxs] = await res.json();
  const out = {};
  meta.universe.forEach((coin, i) => {
    const ctx = ctxs[i];
    out[coin.name] = {
      funding: parseFloat(ctx.fundingRate ?? ctx.funding ?? 0),
      oi:      parseFloat(ctx.openInterest ?? 0),
      markPx:  parseFloat(ctx.markPx ?? ctx.midPx ?? 0),
    };
  });
  return out;
}

async function fetchHistory(coin) {
  const startTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "fundingHistory", coin, startTime }),
  });
  const data = await res.json();
  return data.map(d => ({
    time:  d.time,
    label: new Date(d.time).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", hour12: false }).replace(",", ""),
    rate:  parseFloat(d.fundingRate ?? d.funding ?? 0) * 100, // → %/hr
  }));
}

// ─── useIsMobile ─────────────────────────────────────────────────────────────

function useIsMobile(bp = 768) {
  const [m, setM] = useState(window.innerWidth < bp);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return m;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DeltaNeutral() {
  const [cfg, setCfg] = useUrlState(DEFAULT_DN);
  const set      = k => v => setCfg(prev => ({ ...prev, [k]: v }));
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);

  // API state (not URL-persisted — always fresh on load)
  const [rates,       setRates]       = useState({});
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [histLoading, setHistLoading] = useState(true);
  const [error,       setError]       = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadRates = async () => {
    try {
      const r = await fetchLiveRates();
      setRates(r);
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async coin => {
    setHistLoading(true);
    try {
      setHistory(await fetchHistory(coin));
    } catch {
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  };

  // Fetch on mount + auto-refresh rates every 5 min
  useEffect(() => {
    loadRates();
    const t = setInterval(loadRates, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Refetch history when market changes
  useEffect(() => { loadHistory(cfg.market); }, [cfg.market]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const marketData   = rates[cfg.market];
  const currentRate  = marketData?.funding ?? 0;
  const currentOI    = marketData?.oi ?? 0;
  const currentMark  = marketData?.markPx ?? 0;
  const sigKey       = getSignalLabel(currentRate);
  const signal       = SIGNAL[sigKey] ?? SIGNAL["low"];
  const marketTier   = MARKETS.find(m => m.coin === cfg.market)?.tier ?? 2;

  const carry     = useMemo(() => computeCarry(cfg, currentRate), [cfg, currentRate]);
  const scenarios = useMemo(() => computeScenarios(cfg), [cfg]);
  const liveIdx   = useMemo(() => closestScenarioIndex(currentRate), [currentRate]);
  const levStress = useMemo(() => computeLevStress(cfg.stressCollateral, cfg.stressDebt, cfg.stressLiqThreshold), [cfg.stressCollateral, cfg.stressDebt, cfg.stressLiqThreshold]);
  const rating    = useMemo(() => computeDnRating(cfg, currentRate, marketTier), [cfg, currentRate, marketTier]);

  // Downsample history to ~60 pts for chart perf
  const chartData = useMemo(() => {
    if (history.length <= 60) return history;
    const step = Math.ceil(history.length / 60);
    return history.filter((_, i) => i % step === 0);
  }, [history]);

  const allRecs     = useMemo(() => computeAllRecs(rates, cfg), [rates, cfg]);
  const selectedRec = useMemo(() => computeMarketRec(currentRate, marketTier, cfg), [currentRate, marketTier, cfg]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const minSince = lastUpdated ? Math.round((Date.now() - lastUpdated) / 60000) : null;
  const updatedLabel = loading ? "Fetching..." : error ? "Error" : minSince === 0 ? "Just now" : `${minSince}m ago`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sectionLabel = (text, color = C.dim) => (
    <div style={{ fontSize: 10, color, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>
      {text}
    </div>
  );

  const fmtRate = r => (r >= 0 ? "+" : "") + (r * 100).toFixed(4) + "%";
  const fmtApr  = r => (r >= 0 ? "+" : "") + (r * 24 * 365 * 100).toFixed(1) + "%";
  const fmtDollar = v => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", background: C.bg, minHeight: "100vh", color: C.text, padding: isMobile ? "16px 12px" : "28px 20px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent, boxShadow: "0 0 10px " + C.accent }} />
              <span style={{ fontSize: 11, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>
                Hyperliquid · Delta Neutral Explorer
              </span>
              <span style={{ fontSize: 10, color: loading ? C.amber : error ? C.red : C.muted }}>
                · {updatedLabel}
              </span>
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>
              {cfg.market} — Basis Trade Calculator
            </h1>
            <p style={{ color: C.dim, fontSize: 12, margin: "5px 0 0" }}>
              Long spot + short perp · Net delta zero · Earn funding, not direction
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={handleCopyLink} style={{
              background: copied ? C.green + "22" : C.bg, border: "1px solid " + (copied ? C.green : C.border),
              borderRadius: 6, padding: "6px 14px", fontSize: 11, color: copied ? C.green : C.dim,
              cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
            }}>{copied ? "✓ Copied!" : "⎘ Share Link"}</button>
            <button onClick={loadRates} style={{
              background: C.bg, border: "1px solid " + C.border, borderRadius: 6, padding: "6px 14px",
              fontSize: 11, color: C.dim, cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
            }}>↺ Refresh</button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <StatCard
            label={cfg.market + " Funding Rate"}
            value={loading ? "..." : fmtRate(currentRate) + "/hr"}
            sub={"APR equiv: " + fmtApr(currentRate)}
            color={currentRate >= 0 ? C.green : C.red}
          />
          <StatCard
            label="Net Carry APR"
            value={(carry.netApr >= 0 ? "+" : "") + carry.netApr.toFixed(1) + "%"}
            sub={cfg.mode === "leveraged" ? "After " + cfg.borrowRate + "% borrow cost" : "Standard basis trade"}
            color={carry.isPositive ? C.green : C.red}
          />
          <StatCard
            label="Est. Daily Income"
            value={fmtDollar(carry.dailyNet)}
            sub={"Monthly: " + fmtDollar(carry.monthlyNet)}
            color={carry.isPositive ? C.green : C.red}
          />
          <StatCard
            label="Signal"
            value={signal.label}
            sub={cfg.mode === "leveraged" ? cfg.leverage + "× leveraged" : "Standard 1×"}
            color={signal.color}
          />
        </div>

        {/* Position Recommendations */}
        {!loading && allRecs.length > 0 && (() => {
          const selStyle  = getActionStyle(selectedRec.action);
          const enters    = allRecs.filter(r => r.action === "ENTER");
          const considers = allRecs.filter(r => r.action === "CONSIDER");
          const avoids    = allRecs.filter(r => r.action === "EXIT");

          return (
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              {sectionLabel("◈ Position Recommendations · Based on live rates + risk profile", C.accent)}

              {/* Selected market action */}
              <div style={{
                background: selStyle.bg, border: "1px solid " + selStyle.border,
                borderRadius: 8, padding: "12px 16px", marginBottom: 14,
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: selStyle.color, fontFamily: "monospace" }}>
                      {selectedRec.action}
                    </span>
                    <span style={{ fontSize: 12, color: C.dim }}>— {cfg.market} · {cfg.mode === "leveraged" ? cfg.leverage + "× Leveraged" : "Standard 1×"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6 }}>{selectedRec.reason}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>Risk rating</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: rating.overallColor, fontFamily: "monospace" }}>{rating.overall}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{rating.overallDesc}</span>
                </div>
              </div>

              {/* All-market ranked table */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>

                {/* ENTER */}
                <div>
                  <div style={{ fontSize: 10, color: C.green, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                    ✓ Enter Now
                  </div>
                  {enters.length === 0
                    ? <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>No markets in entry zone</div>
                    : enters.map(r => (
                      <div key={r.coin} onClick={() => setCfg(p => ({ ...p, market: r.coin }))}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 6, marginBottom: 5, cursor: "pointer", background: cfg.market === r.coin ? C.green + "18" : C.bg, border: "1px solid " + (cfg.market === r.coin ? C.green + "44" : C.border) }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{r.coin}</span>
                          <span style={{ fontSize: 9, color: C.muted }}>T{r.tier}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.green, fontFamily: "monospace" }}>+{r.apr.toFixed(1)}% APR</div>
                          <div style={{ fontSize: 9, color: C.muted }}>{rating.overall}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* CONSIDER */}
                <div>
                  <div style={{ fontSize: 10, color: C.accent, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                    ~ Consider
                  </div>
                  {considers.length === 0
                    ? <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>None</div>
                    : considers.map(r => (
                      <div key={r.coin} onClick={() => setCfg(p => ({ ...p, market: r.coin }))}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 6, marginBottom: 5, cursor: "pointer", background: cfg.market === r.coin ? C.accent + "12" : C.bg, border: "1px solid " + (cfg.market === r.coin ? C.accent + "44" : C.border) }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{r.coin}</span>
                          <span style={{ fontSize: 9, color: C.muted }}>T{r.tier}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: "monospace" }}>{r.apr >= 0 ? "+" : ""}{r.apr.toFixed(1)}% APR</div>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* AVOID */}
                <div>
                  <div style={{ fontSize: 10, color: C.red, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                    ✕ Avoid
                  </div>
                  {avoids.length === 0
                    ? <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>None currently negative</div>
                    : avoids.map(r => (
                      <div key={r.coin} onClick={() => setCfg(p => ({ ...p, market: r.coin }))}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 6, marginBottom: 5, cursor: "pointer", background: cfg.market === r.coin ? C.red + "12" : C.bg, border: "1px solid " + (cfg.market === r.coin ? C.red + "44" : C.border) }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{r.coin}</span>
                          <span style={{ fontSize: 9, color: C.muted }}>T{r.tier}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.red, fontFamily: "monospace" }}>{r.apr.toFixed(1)}% APR</div>
                        </div>
                      </div>
                    ))
                  }
                </div>

              </div>
            </div>
          );
        })()}

        {/* Live market rates grid */}
        <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          {sectionLabel("⚡ Live Funding Rates — Hyperliquid · Click to select market", C.accent)}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 8 }}>
            {MARKETS.map(({ coin }) => {
              const r     = rates[coin];
              const fr    = r?.funding ?? null;
              const apr   = fr !== null ? fr * 24 * 365 * 100 : null;
              const isPos = fr !== null && fr >= 0;
              const isSel = cfg.market === coin;
              return (
                <div
                  key={coin}
                  onClick={() => setCfg(prev => ({ ...prev, market: coin }))}
                  style={{
                    background: isSel ? C.accent + "12" : C.bg,
                    border: "1px solid " + (isSel ? C.accent : C.border),
                    borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "border-color 0.15s",
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = C.accent + "44"; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = C.border; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isSel ? C.accent : C.text }}>{coin}</span>
                    {fr !== null && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: isPos ? C.green : C.red, background: (isPos ? C.green : C.red) + "22", padding: "1px 5px", borderRadius: 3 }}>
                        {isPos ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                  {fr === null ? (
                    <div style={{ fontSize: 11, color: C.muted }}>{loading ? "···" : "—"}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isPos ? C.green : C.red, fontFamily: "monospace" }}>
                        {fmtRate(fr)}/hr
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                        {(apr >= 0 ? "+" : "") + apr.toFixed(1)}% APR
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {error && (
            <div style={{ fontSize: 11, color: C.red, textAlign: "center", marginTop: 12 }}>
              ⚠ Could not reach Hyperliquid API. Check connection or refresh.
            </div>
          )}
          {!loading && !error && currentOI > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 24, fontSize: 11, color: C.muted, borderTop: "1px solid " + C.border, paddingTop: 10 }}>
              <span>{cfg.market} Open Interest: <span style={{ color: C.dim, fontFamily: "monospace" }}>${(currentOI / 1e6).toFixed(0)}M</span></span>
              <span>Mark Price: <span style={{ color: C.dim, fontFamily: "monospace" }}>${currentMark.toLocaleString()}</span></span>
            </div>
          )}
        </div>

        {/* Main grid — config left, chart right */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", gap: 16 }}>

          {/* LEFT — Config */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
              {sectionLabel("$ Capital", C.amber)}
              <CapitalInput value={cfg.capital} onChange={set("capital")} />
            </div>

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
              {sectionLabel("⚙ Strategy Mode", C.accent)}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[
                  { key: "standard",  label: "Standard" },
                  { key: "leveraged", label: "Leveraged" },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setCfg(prev => ({ ...prev, mode: key }))} style={{
                    flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 11,
                    fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                    background: cfg.mode === key ? C.green + "22" : C.bg,
                    border: "1px solid " + (cfg.mode === key ? C.green : C.border),
                    color: cfg.mode === key ? C.green : C.dim,
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7, fontStyle: "italic" }}>
                {cfg.mode === "standard"
                  ? "Spot long + perp short (1×). No borrow cost. Cleanest delta neutral structure."
                  : "Leveraged spot + matched perp short. Higher yield but adds borrow cost and spot liquidation risk."}
              </div>
              {cfg.mode === "leveraged" && (
                <div style={{ marginTop: 14, borderTop: "1px solid " + C.border, paddingTop: 14 }}>
                  <Slider label="Leverage" value={cfg.leverage} onChange={set("leverage")} min={1.5} max={5} step={0.5} unit="×" />
                  <NumberInput label="Borrow Rate (APR %)" value={cfg.borrowRate} onChange={set("borrowRate")} hint="Annual cost of spot leverage" />
                </div>
              )}
            </div>

            {cfg.mode === "leveraged" && (
              <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
                {sectionLabel("⚡ Spot Stress Test Inputs", C.red)}
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 12, fontStyle: "italic", lineHeight: 1.6 }}>
                  Enter your actual spot margin position. Perp hedge does not share margin with spot.
                </div>
                <NumberInput label="Spot Collateral ($k)" value={+(cfg.stressCollateral / 1000).toFixed(1)} onChange={v => set("stressCollateral")(Math.round(v * 1000))} hint="Total spot collateral value" />
                <NumberInput label="Spot Debt ($k)" value={+(cfg.stressDebt / 1000).toFixed(1)} onChange={v => set("stressDebt")(Math.round(v * 1000))} hint="Borrowed amount for spot leg" />
                <Slider label="Liq. Threshold" value={cfg.stressLiqThreshold} onChange={set("stressLiqThreshold")} min={50} max={95} step={1} />
              </div>
            )}
          </div>

          {/* RIGHT — History chart + carry breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* History chart */}
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: "18px 16px" }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
                {cfg.market} Funding Rate — Last 7 Days · %/hr
              </div>
              {histLoading ? (
                <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11 }}>
                  Loading history...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: C.dim, fontSize: 10 }} tickFormatter={v => v.toFixed(3) + "%"} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={0} stroke={C.red + "88"} strokeDasharray="4 4" label={{ value: "0%", fill: C.muted, fontSize: 9, position: "insideTopRight" }} />
                    <Line type="monotone" dataKey="rate" stroke={C.green} strokeWidth={1.5} dot={false} name={cfg.market + " %/hr"} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Carry breakdown */}
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
                Carry Breakdown — ${cfg.capital.toLocaleString()} · {cfg.mode === "leveraged" ? cfg.leverage + "× Leveraged" : "Standard 1×"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { label: "Hourly",  value: carry.hourlyNet },
                  { label: "Daily",   value: carry.dailyNet },
                  { label: "Monthly", value: carry.monthlyNet },
                  { label: "Annual",  value: carry.annualNet },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: C.bg, border: "1px solid " + C.border, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: value >= 0 ? C.green : C.red, fontFamily: "monospace" }}>
                      {fmtDollar(value)}
                    </div>
                  </div>
                ))}
              </div>

              {cfg.mode === "leveraged" && (
                <div style={{ marginTop: 12, background: C.bg, borderRadius: 8, padding: "12px 14px", borderLeft: "3px solid " + C.amber }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.dim }}>Gross funding ({fmtApr(currentRate)} APR × {cfg.leverage}× position)</span>
                    <span style={{ fontSize: 11, color: C.green, fontFamily: "monospace", fontWeight: 700 }}>+{carry.annualFundingGross.toFixed(1)}% APR</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.dim }}>Borrow cost ({cfg.borrowRate}% × {(cfg.leverage - 1).toFixed(1)}× borrowed)</span>
                    <span style={{ fontSize: 11, color: C.red, fontFamily: "monospace", fontWeight: 700 }}>−{carry.annualBorrowCost.toFixed(1)}% APR</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid " + C.border }}>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>Net carry</span>
                    <span style={{ fontSize: 13, color: carry.isPositive ? C.green : C.red, fontFamily: "monospace", fontWeight: 800 }}>
                      {carry.netApr >= 0 ? "+" : ""}{carry.netApr.toFixed(1)}% APR
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Yield scenario table */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
            Yield Scenarios — ${cfg.capital.toLocaleString()} · {cfg.mode === "leveraged" ? cfg.leverage + "× Leveraged" : "Standard 1×"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, fontStyle: "italic" }}>
            Theoretical projections at fixed rates. Real yield varies hourly. Current live rate row highlighted.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid " + C.border }}>
                  {["Rate/hr", "Env", "Daily APY", "Daily $", "Monthly $", "Annual APY", ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", color: C.dim, fontWeight: 600, textAlign: "right", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s, i) => {
                  const isLive = i === liveIdx;
                  const sig    = SIGNAL[s.signal] ?? SIGNAL["low"];
                  const c      = s.carry;
                  const dailyApy = c.capital > 0
                    ? (c.dailyNet / cfg.capital * 100).toFixed(3)
                    : "0.000";
                  return (
                    <tr key={i} style={{
                      borderBottom: "1px solid " + C.border,
                      background: isLive ? sig.color + "12" : "transparent",
                    }}>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: s.rate >= 0 ? C.green : C.red }}>
                        {fmtRate(s.rate)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: sig.color, background: sig.color + "22", padding: "2px 6px", borderRadius: 3 }}>
                          {sig.label}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: c.dailyNet >= 0 ? C.green : C.red, fontFamily: "monospace" }}>
                        {(c.dailyNet >= 0 ? "+" : "") + (c.dailyNet / cfg.capital * 100).toFixed(3)}%
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: c.dailyNet >= 0 ? C.green : C.red, fontFamily: "monospace", fontWeight: 700 }}>
                        {fmtDollar(c.dailyNet)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                        {fmtDollar(c.monthlyNet)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: c.netApr >= 0 ? C.green : C.red, fontFamily: "monospace", fontWeight: 800 }}>
                        {c.netApr >= 0 ? "+" : ""}{c.netApr.toFixed(1)}%
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", minWidth: 56 }}>
                        {isLive && <span style={{ fontSize: 9, color: C.accent, fontWeight: 700, fontFamily: "monospace" }}>← LIVE</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Risk Rating */}
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.accent, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700 }}>◈ Strategy Risk Assessment</div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <div style={{ background: rating.overallColor + "22", border: "1px solid " + rating.overallColor, borderRadius: 6, padding: "4px 16px", fontSize: 18, fontWeight: 900, color: rating.overallColor, fontFamily: "monospace" }}>
              {rating.overall}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", marginBottom: 16 }}>{rating.overallDesc}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
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
              { band: "Aaa–Aa", label: "Investment Grade · Minimal Risk",    color: C.green },
              { band: "A–Baa",  label: "Investment Grade · Moderate Risk",   color: C.accent },
              { band: "Ba–B",   label: "Speculative · Substantial Risk",     color: C.amber },
              { band: "Caa–C",  label: "High Risk",                          color: C.red },
            ].map(r => (
              <div key={r.band} style={{ display: "flex", alignItems: "center", gap: 6, background: C.bg, border: "1px solid " + C.border, borderRadius: 6, padding: "5px 10px", fontSize: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.color }} />
                <span style={{ color: r.color, fontWeight: 700, fontFamily: "monospace" }}>{r.band}</span>
                <span style={{ color: C.dim }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Leveraged stress test */}
        {cfg.mode === "leveraged" && (
          <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: C.red, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700 }}>⚡ Spot Leg Liquidation Stress Test</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <div style={{ fontSize: 10, color: C.dim }}>How far can {cfg.market} drop before spot liquidation?</div>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 16, fontStyle: "italic" }}>
              The perp hedge does NOT protect against spot leg liquidation — separate margin accounts, separate thresholds.
            </div>
            {(() => {
              const stressDebt  = cfg.stressDebt;
              const liqThresh   = cfg.stressLiqThreshold / 100;
              const currentHF   = stressDebt > 0 ? +((cfg.stressCollateral * liqThresh) / stressDebt).toFixed(3) : 999;
              const liqDropPct  = stressDebt > 0 ? +((1 - stressDebt / (cfg.stressCollateral * liqThresh)) * 100).toFixed(2) : 0;
              return (
                <div style={{
                  background: currentHF >= 1.7 ? "rgba(0,229,160,0.07)" : currentHF >= 1.4 ? "rgba(245,166,35,0.07)" : "rgba(255,77,109,0.07)",
                  border: "1px solid " + (currentHF >= 1.7 ? C.green : currentHF >= 1.4 ? C.amber : C.red),
                  borderRadius: 8, padding: "10px 16px", marginBottom: 14,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.dim }}>Current Health Factor</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {liqDropPct > 0 ? `Liquidates at −${liqDropPct}% ${cfg.market} drop` : "Already at risk"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: currentHF >= 1.7 ? C.green : currentHF >= 1.4 ? C.amber : C.red }}>
                      {currentHF >= 999 ? "∞" : currentHF}
                    </span>
                    <span style={{ fontSize: 11, color: C.dim }}>
                      {currentHF >= 1.7 ? "✓ Safe" : currentHF >= 1.4 ? "⚠ Caution" : "🚨 Danger"}
                    </span>
                  </div>
                </div>
              );
            })()}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid " + C.border }}>
                    {[cfg.market + " Drop", "Collateral Value", "Debt", "Health Factor", "Status", "Buffer"].map(h => (
                      <th key={h} style={{ padding: "6px 12px", color: C.dim, fontWeight: 600, textAlign: "right", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {levStress.map(row => {
                    const isLiq     = row.hf < 1.0;
                    const isDanger  = row.hf < 1.4;
                    const isCaution = row.hf < 1.7;
                    const col    = isLiq || isDanger ? C.red : isCaution ? C.amber : C.green;
                    const status = isLiq ? "🚨 LIQUIDATED" : isDanger ? "🚨 Danger" : isCaution ? "⚠ Caution" : "✓ Safe";
                    return (
                      <tr key={row.drop} style={{ borderBottom: "1px solid " + C.border, background: row.drop === 0 ? "rgba(0,212,255,0.05)" : isLiq ? "rgba(255,77,109,0.05)" : "transparent" }}>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: row.drop === 0 ? C.accent : C.red, fontFamily: "monospace", fontWeight: row.drop === 0 ? 700 : 400 }}>
                          {row.drop === 0 ? "Current (0%)" : row.drop + "%"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace" }}>${row.colVal.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: C.muted }}>${cfg.stressDebt.toLocaleString()}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: col }}>{row.hf >= 999 ? "∞" : row.hf}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: col, fontSize: 11 }}>{status}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: isLiq ? C.red : C.dim, fontSize: 11 }}>
                          {isLiq ? "—" : row.bufferPct !== null ? row.bufferPct + "% drop remaining" : "∞"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, background: C.bg, borderRadius: 8, padding: "10px 14px", fontSize: 11, borderLeft: "3px solid " + C.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.dim }}>Spot liquidation triggered at</span>
              {(() => {
                const liqThresh  = cfg.stressLiqThreshold / 100;
                const liqDropPct = cfg.stressDebt > 0 ? +((1 - cfg.stressDebt / (cfg.stressCollateral * liqThresh)) * 100).toFixed(2) : 0;
                return (
                  <span style={{ color: C.red, fontFamily: "monospace", fontWeight: 800, fontSize: 14 }}>
                    {liqDropPct > 0 ? `−${liqDropPct}% ${cfg.market} price drop` : "Already at risk"}
                  </span>
                );
              })()}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: C.dim, lineHeight: 1.8 }}>
          <div>⚠ For educational purposes only. Not financial advice. DeFi carries significant risk including liquidation, smart contract risk, and funding rate reversals.</div>
          <div style={{ marginTop: 4, color: C.muted }}>Live funding data: Hyperliquid · Settlement: every 1 hour · Auto-refreshes every 5 minutes</div>
        </div>

      </div>
    </div>
  );
}
