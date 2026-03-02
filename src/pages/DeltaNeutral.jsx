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
  computeCarry, computeScenarios, computeLevStress,
  getSignalLabel, closestScenarioIndex, computeDnRating,
  computeMarketRec, getActionStyle,
} from "../dnComputations.js";

// ─── Markets V2 — crypto + commodities ──────────────────────────────────────

const MARKETS_V2 = [
  // Crypto — available on both Lighter and Hyperliquid
  { coin: "ETH",  tier: 1, category: "crypto",    marketId: 0,   label: "Ethereum" },
  { coin: "BTC",  tier: 1, category: "crypto",    marketId: 1,   label: "Bitcoin" },
  { coin: "SOL",  tier: 2, category: "crypto",    marketId: 2,   label: "Solana" },
  { coin: "XRP",  tier: 2, category: "crypto",    marketId: 7,   label: "XRP" },
  { coin: "DOGE", tier: 3, category: "crypto",    marketId: 3,   label: "Dogecoin" },
  { coin: "AVAX", tier: 2, category: "crypto",    marketId: 9,   label: "Avalanche" },
  { coin: "LINK", tier: 2, category: "crypto",    marketId: 8,   label: "Chainlink" },
  { coin: "SUI",  tier: 3, category: "crypto",    marketId: 16,  label: "Sui" },
  { coin: "HYPE", tier: 3, category: "crypto",    marketId: 24,  label: "Hyperliquid" },
  { coin: "WIF",  tier: 3, category: "crypto",    marketId: 5,   label: "dogwifhat" },
  // Commodities — Lighter only
  { coin: "XAU",  tier: 2, category: "commodity", marketId: 92,  label: "Gold" },
  { coin: "XAG",  tier: 2, category: "commodity", marketId: 93,  label: "Silver" },
  { coin: "WTI",  tier: 2, category: "commodity", marketId: 145, label: "Oil" },
  { coin: "XCU",  tier: 3, category: "commodity", marketId: 136, label: "Copper" },
];

const CRYPTO_COINS = MARKETS_V2.filter(m => m.category === "crypto");
const COMMODITY_COINS = MARKETS_V2.filter(m => m.category === "commodity");

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
  exchange:           "lighter",
  capital:            10000,
  mode:               "standard",
  leverage:           2,
  borrowRate:         5,
  stressCollateral:   20000,
  stressDebt:         10000,
  stressLiqThreshold: 85,
};

// ─── API fetchers ────────────────────────────────────────────────────────────

// Lighter funding-rates returns 8-hour rates — divide by 8 to get hourly
const LIGHTER_RATE_DIVISOR = 8;

async function fetchLighterRates() {
  const res = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/funding-rates");
  const data = await res.json();
  const lighter = {};
  const hl = {};
  const symbols = new Set(MARKETS_V2.map(m => m.coin));
  data.funding_rates.forEach(r => {
    if (!symbols.has(r.symbol)) return;
    const hourly = r.rate / LIGHTER_RATE_DIVISOR;
    if (r.exchange === "lighter") lighter[r.symbol] = hourly;
    if (r.exchange === "hyperliquid") hl[r.symbol] = hourly;
  });
  return { lighter, hyperliquid: hl };
}

async function fetchHLDirect() {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  const [meta, ctxs] = await res.json();
  const out = {};
  const tracked = new Set(CRYPTO_COINS.map(m => m.coin));
  meta.universe.forEach((coin, i) => {
    if (!tracked.has(coin.name)) return;
    const ctx = ctxs[i];
    out[coin.name] = {
      funding: parseFloat(ctx.funding ?? 0),
      oi:      parseFloat(ctx.openInterest ?? 0),
      markPx:  parseFloat(ctx.markPx ?? ctx.midPx ?? 0),
    };
  });
  return out;
}

async function fetchCommodityDetails() {
  const ids = COMMODITY_COINS.map(m => m.marketId);
  const results = await Promise.all(
    ids.map(id =>
      fetch(`https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails?market_id=${id}`)
        .then(r => r.json())
    )
  );
  const out = {};
  results.forEach(r => {
    const d = r.order_book_details?.[0];
    if (d) {
      out[d.symbol] = {
        markPx: d.last_trade_price,
        oi:     d.open_interest,
      };
    }
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
    rate:  parseFloat(d.fundingRate ?? d.funding ?? 0) * 100,
  }));
}

// ─── Local computeAllRecs (uses MARKETS_V2) ────────────────────────────────

function computeAllRecsLocal(ratesMap, cfg) {
  return MARKETS_V2
    .map(({ coin, tier }) => {
      const fr = ratesMap[coin] ?? null;
      if (fr === null) return null;
      const rec   = computeMarketRec(fr, tier, cfg);
      const apr   = fr * 24 * 365 * 100;
      const carry = computeCarry(cfg, fr);
      const score = rec.action === "EXIT"     ? apr - 200
                  : rec.action === "WAIT"     ? Math.min(apr, 5)
                  : rec.action === "CONSIDER" ? apr + (tier === 1 ? 3 : 0)
                  :                             apr + (tier === 1 ? 6 : tier === 2 ? 3 : 0);
      return { coin, tier, fr, apr, carry, ...rec, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
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

  // Multi-exchange rates: { lighter: { ETH: rate, ... }, hyperliquid: { ETH: rate, ... } }
  const [rates,       setRates]       = useState({ lighter: {}, hyperliquid: {} });
  const [hlDetails,   setHLDetails]   = useState({});
  const [comDetails,  setComDetails]  = useState({});
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [histLoading, setHistLoading] = useState(true);
  const [error,       setError]       = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const exchange = cfg.exchange || "lighter";
  const isCommodity = COMMODITY_COINS.some(m => m.coin === cfg.market);

  // Active exchange rates for the selected exchange
  // Crypto: HL direct API when "hyperliquid", Lighter API when "lighter"
  // Commodities: always Lighter (only source)
  const activeRates = useMemo(() => {
    const merged = {};
    CRYPTO_COINS.forEach(m => {
      if (exchange === "hyperliquid") {
        // Use HL direct API (authoritative, no aggregation lag)
        merged[m.coin] = hlDetails[m.coin]?.funding ?? null;
      } else {
        // Use Lighter's own rates
        merged[m.coin] = rates.lighter?.[m.coin] ?? null;
      }
    });
    COMMODITY_COINS.forEach(m => {
      merged[m.coin] = rates.lighter?.[m.coin] ?? null;
    });
    return merged;
  }, [rates, hlDetails, exchange]);

  const loadRates = async () => {
    try {
      const [lr, hld, cd] = await Promise.all([
        fetchLighterRates(),
        fetchHLDirect(),
        fetchCommodityDetails(),
      ]);
      setRates(lr);
      setHLDetails(hld);
      setComDetails(cd);
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async coin => {
    if (COMMODITY_COINS.some(m => m.coin === coin)) {
      setHistory([]);
      setHistLoading(false);
      return;
    }
    setHistLoading(true);
    try {
      setHistory(await fetchHistory(coin));
    } catch {
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  };

  useEffect(() => {
    loadRates();
    const t = setInterval(loadRates, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { loadHistory(cfg.market); }, [cfg.market]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const currentRate  = activeRates[cfg.market] ?? 0;
  const marketMeta   = MARKETS_V2.find(m => m.coin === cfg.market);
  const marketTier   = marketMeta?.tier ?? 2;

  // Market details — HL for crypto, Lighter for commodities
  const marketDetail = isCommodity
    ? comDetails[cfg.market]
    : hlDetails[cfg.market];
  const currentOI    = marketDetail?.oi ?? 0;
  const currentMark  = marketDetail?.markPx ?? 0;

  const sigKey       = getSignalLabel(currentRate);
  const signal       = SIGNAL[sigKey] ?? SIGNAL["low"];

  const carry     = useMemo(() => computeCarry(cfg, currentRate), [cfg, currentRate]);
  const scenarios = useMemo(() => computeScenarios(cfg), [cfg]);
  const liveIdx   = useMemo(() => closestScenarioIndex(currentRate), [currentRate]);
  const levStress = useMemo(() => computeLevStress(cfg.stressCollateral, cfg.stressDebt, cfg.stressLiqThreshold), [cfg.stressCollateral, cfg.stressDebt, cfg.stressLiqThreshold]);
  const rating    = useMemo(() => computeDnRating(cfg, currentRate, marketTier), [cfg, currentRate, marketTier]);

  const chartData = useMemo(() => {
    if (history.length <= 60) return history;
    const step = Math.ceil(history.length / 60);
    return history.filter((_, i) => i % step === 0);
  }, [history]);

  const allRecs     = useMemo(() => computeAllRecsLocal(activeRates, cfg), [activeRates, cfg]);
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

  const sectionLabel = (text, barColor = C.accent, margin = "-16px -16px 12px -16px") => (
    <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: barColor, padding: "5px 16px", margin }}>
      {text}
    </div>
  );

  const fmtRate  = r => (r >= 0 ? "+" : "") + (r * 100).toFixed(4) + "%";
  const fmtApr   = r => (r >= 0 ? "+" : "") + (r * 24 * 365 * 100).toFixed(1) + "%";
  const fmtDollar = v => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2);

  const exchangeLabel = exchange === "lighter" ? "Lighter" : "Hyperliquid";
  const marketDisplayName = marketMeta ? `${marketMeta.coin}${marketMeta.category === "commodity" ? " (" + marketMeta.label + ")" : ""}` : cfg.market;

  // ─── Market tile renderer ─────────────────────────────────────────────────

  const renderMarketTile = ({ coin, label, category }) => {
    const exRate    = activeRates[coin] ?? null;
    // Alt rate: show the OTHER exchange's rate for comparison
    const altRate   = category === "crypto"
      ? (exchange === "lighter" ? (hlDetails[coin]?.funding ?? null) : (rates.lighter?.[coin] ?? null))
      : null;
    const fr        = exRate;
    const apr       = fr !== null ? fr * 24 * 365 * 100 : null;
    const isPos     = fr !== null && fr >= 0;
    const isSel     = cfg.market === coin;
    const isCom     = category === "commodity";

    return (
      <div
        key={coin}
        onClick={() => setCfg(prev => ({ ...prev, market: coin }))}
        style={{
          background: isSel ? C.accent + "12" : C.bg,
          border: "1px solid " + (isSel ? C.accent : C.border),
          borderRadius: 2, padding: "10px 12px", cursor: "pointer", transition: "border-color 0.15s",
        }}
        onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = C.accent + "44"; }}
        onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = C.border; }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: isSel ? C.accent : C.text }}>{coin}</span>
            {isCom && <span style={{ fontSize: 8, color: C.amber, background: C.amber + "22", padding: "1px 4px", borderRadius: 2, fontWeight: 700 }}>{label}</span>}
          </div>
          {fr !== null && (
            <span style={{ fontSize: 9, fontWeight: 700, color: isPos ? C.green : C.red, background: (isPos ? C.green : C.red) + "22", padding: "1px 5px", borderRadius: 2 }}>
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
            {altRate !== null && !isCom && (
              <div style={{ fontSize: 8, color: C.dim, marginTop: 3 }}>
                {exchange === "lighter" ? "HL" : "LR"}: {fmtRate(altRate)}/hr
              </div>
            )}
          </>
        )}
      </div>
    );
  };

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
                Lighter + Hyperliquid · Delta Neutral Explorer
              </span>
              <span style={{ fontSize: 10, color: loading ? C.amber : error ? C.red : C.muted }}>
                · {updatedLabel}
              </span>
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>
              {marketDisplayName} — Basis Trade Calculator
            </h1>
            <p style={{ color: C.dim, fontSize: 12, margin: "5px 0 0" }}>
              {isCommodity
                ? "Long tokenized commodity + short perp · Net delta zero · Earn funding"
                : "Long spot + short perp · Net delta zero · Earn funding, not direction"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={handleCopyLink} style={{
              background: copied ? C.green + "22" : C.bg, border: "1px solid " + (copied ? C.green : C.border),
              borderRadius: 2, padding: "6px 14px", fontSize: 11, color: copied ? C.green : C.dim,
              cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
            }}>{copied ? "✓ Copied!" : "⎘ Share Link"}</button>
            <button onClick={loadRates} style={{
              background: C.bg, border: "1px solid " + C.border, borderRadius: 2, padding: "6px 14px",
              fontSize: 11, color: C.dim, cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
            }}>↺ Refresh</button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <StatCard
            label={cfg.market + " Funding Rate"}
            value={loading ? "..." : fmtRate(currentRate) + "/hr"}
            sub={"APR equiv: " + fmtApr(currentRate) + " · " + exchangeLabel}
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
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16, marginBottom: 16 }}>
              {sectionLabel("POSITION RECOMMENDATIONS — LIVE RATES + RISK PROFILE", C.accent)}

              <div style={{
                background: selStyle.bg, border: "1px solid " + selStyle.border,
                borderRadius: 2, padding: "12px 16px", marginBottom: 14,
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: selStyle.color, fontFamily: "monospace" }}>
                      {selectedRec.action}
                    </span>
                    <span style={{ fontSize: 12, color: C.dim }}>— {marketDisplayName} · {cfg.mode === "leveraged" ? cfg.leverage + "× Leveraged" : "Standard 1×"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6 }}>{selectedRec.reason}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>Risk rating</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: rating.overallColor, fontFamily: "monospace" }}>{rating.overall}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{rating.overallDesc}</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { title: "✓ Enter Now", items: enters,    color: C.green,  emptyText: "No markets in entry zone" },
                  { title: "~ Consider",  items: considers, color: C.accent, emptyText: "None" },
                  { title: "✕ Avoid",     items: avoids,    color: C.red,    emptyText: "None currently negative" },
                ].map(({ title, items, color, emptyText }) => (
                  <div key={title}>
                    <div style={{ fontSize: 10, color, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>{title}</div>
                    {items.length === 0
                      ? <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>{emptyText}</div>
                      : items.map(r => {
                        const isCom = COMMODITY_COINS.some(m => m.coin === r.coin);
                        return (
                          <div key={r.coin} onClick={() => setCfg(p => ({ ...p, market: r.coin }))}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderRadius: 2, marginBottom: 5, cursor: "pointer", background: cfg.market === r.coin ? color + "18" : C.bg, border: "1px solid " + (cfg.market === r.coin ? color + "44" : C.border) }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{r.coin}</span>
                              <span style={{ fontSize: 9, color: C.muted }}>T{r.tier}</span>
                              {isCom && <span style={{ fontSize: 7, color: C.amber, fontWeight: 700 }}>COM</span>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>{r.apr >= 0 ? "+" : ""}{r.apr.toFixed(1)}% APR</div>
                            </div>
                          </div>
                        );
                      })
                    }
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Live market rates grid — grouped by category */}
        <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16, marginBottom: 16 }}>
          {sectionLabel("LIVE FUNDING RATES · CLICK TO SELECT MARKET", C.green)}

          {/* Exchange selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em" }}>EXCHANGE:</span>
            {["lighter", "hyperliquid"].map(ex => (
              <button key={ex} onClick={() => setCfg(p => ({ ...p, exchange: ex }))} style={{
                padding: "4px 12px", borderRadius: 2, fontSize: 10,
                fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                background: exchange === ex ? C.green + "22" : C.bg,
                border: "1px solid " + (exchange === ex ? C.green : C.border),
                color: exchange === ex ? C.green : C.dim,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>{ex === "lighter" ? "Lighter" : "Hyperliquid"}</button>
            ))}
          </div>

          {/* Crypto */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, marginBottom: 7, paddingBottom: 4, borderBottom: "1px solid " + C.border }}>
              CRYPTO
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 8 }}>
              {CRYPTO_COINS.map(renderMarketTile)}
            </div>
          </div>

          {/* Commodities */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: C.amber, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, marginBottom: 7, paddingBottom: 4, borderBottom: "1px solid " + C.border }}>
              COMMODITIES · LIGHTER
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 8 }}>
              {COMMODITY_COINS.map(renderMarketTile)}
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 11, color: C.red, textAlign: "center", marginTop: 12 }}>
              Could not reach exchange APIs. Check connection or refresh.
            </div>
          )}
          {!loading && !error && currentMark > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 24, fontSize: 11, color: C.muted, borderTop: "1px solid " + C.border, paddingTop: 10, flexWrap: "wrap" }}>
              <span>{cfg.market} Open Interest: <span style={{ color: C.dim, fontFamily: "monospace" }}>{currentOI >= 1e6 ? "$" + (currentOI / 1e6).toFixed(0) + "M" : currentOI.toLocaleString()}</span></span>
              <span>Price: <span style={{ color: C.dim, fontFamily: "monospace" }}>${currentMark.toLocaleString()}</span></span>
              <span style={{ fontSize: 9, color: C.dim }}>via {isCommodity ? "Lighter" : (exchange === "lighter" ? "Lighter" : "Hyperliquid")}</span>
            </div>
          )}
        </div>

        {/* Main grid — config left, chart right */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "280px 1fr", gap: 16 }}>

          {/* LEFT — Config */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
              {sectionLabel("CAPITAL", C.accent)}
              <CapitalInput value={cfg.capital} onChange={set("capital")} />
            </div>

            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
              {sectionLabel("STRATEGY MODE", C.amber)}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[
                  { key: "standard",  label: "Standard" },
                  { key: "leveraged", label: "Leveraged" },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setCfg(prev => ({ ...prev, mode: key }))} style={{
                    flex: 1, padding: "7px 0", borderRadius: 2, fontSize: 11,
                    fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                    background: cfg.mode === key ? C.green + "22" : C.bg,
                    border: "1px solid " + (cfg.mode === key ? C.green : C.border),
                    color: cfg.mode === key ? C.green : C.dim,
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7, fontStyle: "italic" }}>
                {cfg.mode === "standard"
                  ? "Spot long + perp short (1x). No borrow cost. Cleanest delta neutral structure."
                  : "Leveraged spot + matched perp short. Higher yield but adds borrow cost and spot liquidation risk."}
              </div>
              {cfg.mode === "leveraged" && (
                <div style={{ marginTop: 14, borderTop: "1px solid " + C.border, paddingTop: 14 }}>
                  <Slider label="Leverage" value={cfg.leverage} onChange={set("leverage")} min={1.5} max={5} step={0.5} unit="x" />
                  <NumberInput label="Borrow Rate (APR %)" value={cfg.borrowRate} onChange={set("borrowRate")} hint="Annual cost of spot leverage" />
                </div>
              )}
            </div>

            {cfg.mode === "leveraged" && (
              <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
                {sectionLabel("SPOT STRESS TEST INPUTS", C.red)}
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
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: "18px 16px" }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, background: "#151515", borderBottom: "1px solid " + C.border, padding: "5px 16px", margin: "-18px -16px 16px -16px" }}>
                {cfg.market} FUNDING RATE — {isCommodity ? "HISTORY UNAVAILABLE · LIGHTER" : "LAST 7 DAYS · %/HR · HYPERLIQUID"}
              </div>
              {isCommodity ? (
                <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: C.muted }}>
                  <div style={{ fontSize: 12 }}>Funding history not yet available for Lighter commodity perps</div>
                  <div style={{ fontSize: 10, color: C.dim }}>Current rate: {fmtRate(currentRate)}/hr ({fmtApr(currentRate)} APR)</div>
                </div>
              ) : histLoading ? (
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
            <div style={{ background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 16 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, background: "#151515", borderBottom: "1px solid " + C.border, padding: "5px 16px", margin: "-16px -16px 14px -16px" }}>
                CARRY BREAKDOWN — ${cfg.capital.toLocaleString()} · {cfg.mode === "leveraged" ? cfg.leverage + "x LEVERAGED" : "STANDARD 1x"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { label: "Hourly",  value: carry.hourlyNet },
                  { label: "Daily",   value: carry.dailyNet },
                  { label: "Monthly", value: carry.monthlyNet },
                  { label: "Annual",  value: carry.annualNet },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: C.bg, border: "1px solid " + C.border, borderRadius: 2, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: value >= 0 ? C.green : C.red, fontFamily: "monospace" }}>
                      {fmtDollar(value)}
                    </div>
                  </div>
                ))}
              </div>

              {cfg.mode === "leveraged" && (
                <div style={{ marginTop: 12, background: C.bg, borderRadius: 2, padding: "12px 14px", borderLeft: "3px solid " + C.amber }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.dim }}>Gross funding ({fmtApr(currentRate)} APR x {cfg.leverage}x position)</span>
                    <span style={{ fontSize: 11, color: C.green, fontFamily: "monospace", fontWeight: 700 }}>+{carry.annualFundingGross.toFixed(1)}% APR</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: C.dim }}>Borrow cost ({cfg.borrowRate}% x {(cfg.leverage - 1).toFixed(1)}x borrowed)</span>
                    <span style={{ fontSize: 11, color: C.red, fontFamily: "monospace", fontWeight: 700 }}>-{carry.annualBorrowCost.toFixed(1)}% APR</span>
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
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 20 }}>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, background: "#151515", borderBottom: "1px solid " + C.border, padding: "5px 20px", margin: "-20px -20px 6px -20px" }}>
            YIELD SCENARIOS — ${cfg.capital.toLocaleString()} · {cfg.mode === "leveraged" ? cfg.leverage + "x LEVERAGED" : "STANDARD 1x"}
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
                  return (
                    <tr key={i} style={{
                      borderBottom: "1px solid " + C.border,
                      background: isLive ? sig.color + "12" : "transparent",
                    }}>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: s.rate >= 0 ? C.green : C.red }}>
                        {fmtRate(s.rate)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: sig.color, background: sig.color + "22", padding: "2px 6px", borderRadius: 2 }}>
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
        <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 20 }}>
          <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.accent, padding: "5px 20px", margin: "-20px -20px 16px -20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>STRATEGY RISK ASSESSMENT</span>
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
              { band: "Aaa-Aa", label: "Investment Grade - Minimal Risk",    color: C.green },
              { band: "A-Baa",  label: "Investment Grade - Moderate Risk",   color: C.accent },
              { band: "Ba-B",   label: "Speculative - Substantial Risk",     color: C.amber },
              { band: "Caa-C",  label: "High Risk",                          color: C.red },
            ].map(r => (
              <div key={r.band} style={{ display: "flex", alignItems: "center", gap: 6, background: C.bg, border: "1px solid " + C.border, borderRadius: 2, padding: "5px 10px", fontSize: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.color }} />
                <span style={{ color: r.color, fontWeight: 700, fontFamily: "monospace" }}>{r.band}</span>
                <span style={{ color: C.dim }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Leveraged stress test */}
        {cfg.mode === "leveraged" && (
          <div style={{ marginTop: 16, background: C.panel, border: "1px solid " + C.border, borderRadius: 2, padding: 20 }}>
            <div style={{ fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 900, background: C.red, padding: "5px 20px", margin: "-20px -20px 6px -20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>SPOT LEG LIQUIDATION STRESS TEST</span>
              {!isMobile && <span style={{ fontSize: 9, fontWeight: 700 }}>How far can {cfg.market} drop?</span>}
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
                  borderRadius: 2, padding: "10px 16px", marginBottom: 14,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.dim }}>Current Health Factor</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {liqDropPct > 0 ? `Liquidates at -${liqDropPct}% ${cfg.market} drop` : "Already at risk"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: currentHF >= 1.7 ? C.green : currentHF >= 1.4 ? C.amber : C.red }}>
                      {currentHF >= 999 ? "∞" : currentHF}
                    </span>
                    <span style={{ fontSize: 11, color: C.dim }}>
                      {currentHF >= 1.7 ? "Safe" : currentHF >= 1.4 ? "Caution" : "Danger"}
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
                    const status = isLiq ? "LIQUIDATED" : isDanger ? "Danger" : isCaution ? "Caution" : "Safe";
                    return (
                      <tr key={row.drop} style={{
                        borderBottom: "1px solid " + C.border,
                        background: row.drop === 0 ? "rgba(0,212,255,0.05)" : isLiq ? "rgba(255,77,109,0.05)" : "transparent",
                      }}>
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
            <div style={{ marginTop: 12, background: C.bg, borderRadius: 2, padding: "10px 14px", fontSize: 11, borderLeft: "3px solid " + C.red, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.dim }}>Spot liquidation triggered at</span>
              {(() => {
                const liqThresh  = cfg.stressLiqThreshold / 100;
                const liqDropPct = cfg.stressDebt > 0 ? +((1 - cfg.stressDebt / (cfg.stressCollateral * liqThresh)) * 100).toFixed(2) : 0;
                return (
                  <span style={{ color: C.red, fontFamily: "monospace", fontWeight: 800, fontSize: 14 }}>
                    {liqDropPct > 0 ? `-${liqDropPct}% ${cfg.market} price drop` : "Already at risk"}
                  </span>
                );
              })()}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 10, color: C.dim, lineHeight: 1.8 }}>
          <div>For educational purposes only. Not financial advice. DeFi carries significant risk including liquidation, smart contract risk, and funding rate reversals.</div>
          <div style={{ marginTop: 4, color: C.muted }}>Live funding data: Lighter + Hyperliquid · Settlement: every 1 hour · Auto-refreshes every 5 minutes</div>
        </div>

      </div>
    </div>
  );
}
