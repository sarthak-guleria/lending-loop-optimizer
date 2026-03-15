import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Bar,
} from "recharts";
import { C } from "../constants.js";
import { useUrlState } from "../hooks/useUrlState.js";
import StatCard from "../components/StatCard.jsx";
import CapitalInput from "../components/CapitalInput.jsx";
import {
  computeIL_V2, computeNetYield_V2, computeNetYield_V3,
  computeCapitalEfficiency, computeILTable,
  exportLPCsv, rankPools, classifyPool, gradeColor, computeSweetSpot,
} from "../lpComputations.js";
import {
  parseFeeFromGeckoName, parseSymbolFromGeckoName, feeTierFromPool as feeTierFromPoolHelper,
} from "../lpHelpers.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const ALL_CHAINS = ["All", "Ethereum", "Arbitrum", "Base", "Polygon", "Optimism", "BSC", "Avalanche", "Celo", "Monad"];

const RISK_APPETITES = [
  { key: "All",          label: "ALL POOLS",     types: ["stable", "major", "exotic"], color: C.text,   desc: "Everything" },
  { key: "Conservative", label: "CONSERVATIVE",  types: ["stable"],                    color: C.green,  desc: "Stable pairs only — minimal IL" },
  { key: "Moderate",     label: "MODERATE",       types: ["stable", "major"],           color: C.amber,  desc: "Stable + blue-chip pairs" },
  { key: "Aggressive",   label: "AGGRESSIVE",     types: ["stable", "major", "exotic"], color: C.red,    desc: "All pools including exotic pairs" },
];

const SORT_OPTIONS = [
  { key: "score", label: "Score" },
  { key: "apy",   label: "APY" },
  { key: "tvl",   label: "TVL" },
  { key: "vol",   label: "Volume" },
];

// Chain slug mapping for DEX pool URLs
const CHAIN_SLUGS = {
  Ethereum:  "ethereum",
  Arbitrum:  "arbitrum",
  Base:      "base",
  Polygon:   "polygon",
  Optimism:  "optimism",
  BSC:       "bnb",
  Avalanche: "avalanche",
  Celo:      "celo",
  Monad:     "monad",
};

// Hardcoded fallback for CoinGecko top-100 (used if API call fails)
const TOP100_FALLBACK = new Set([
  "BTC","WBTC","ETH","WETH","BNB","SOL","XRP","ADA","DOGE","AVAX",
  "TRX","DOT","LINK","MATIC","POL","SHIB","TON","SUI","NEAR","APT",
  "UNI","LTC","ATOM","ARB","OP","FIL","AAVE","MKR","RENDER","INJ",
  "IMX","HBAR","SEI","STX","PEPE","CRO","ALGO","FTM","GRT","SNX",
  "LDO","ONDO","JUP","WIF","BONK","WLD","ENS","PENDLE","ENA","TAO",
  "FET","SAND","AXS","CRV","COMP","SUSHI","GMX","DYDX","MON",
]);

// ─── DEX Registry ────────────────────────────────────────────────────────────
// Add future DEXes here — no other code changes needed.
const DEX_REGISTRY = {
  "uniswap-v3": {
    label: "Uniswap V3",
    llamaProject: "uniswap-v3",
    poolUrl: (chain, addr) => {
      const slug = CHAIN_SLUGS[chain];
      if (!slug || !addr) return null;
      return `https://app.uniswap.org/explore/pools/${slug}/${addr}`;
    },
    // GeckoTerminal (free, no key) — covers 5 chains
    geckoTerminal: {
      Ethereum: { network: "eth",          dex: "uniswap_v3" },
      Arbitrum: { network: "arbitrum",     dex: "uniswap_v3_arbitrum" },
      Base:     { network: "base",         dex: "uniswap-v3-base" },
      Polygon:  { network: "polygon_pos",  dex: "uniswap_v3_polygon_pos" },
      Optimism: { network: "optimism",     dex: "uniswap_v3_optimism" },
      // BSC, Avalanche, Celo: no Uniswap V3 on GeckoTerminal
    },
    // The Graph subgraph IDs (requires VITE_GRAPH_API_KEY) — used for sweet-spot analysis
    subgraphIds: {
      Ethereum:  "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
      Arbitrum:  "FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aJM",
      Base:      "43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG",
      Polygon:   "3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCbhjm",
      Optimism:  "Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82zwiBFLaj",
      BSC:       "F85MNzUGYqgSHSHRGgeVMNsdnW1KtZSVgFULumXRZTw2",
      Avalanche: "GVH9h9KZ9CqheUEL93qMbq7QwgoBu32QXQDPR6bev4Eo",
      Celo:      "ESdrTJ3twMwWVoQ1hUE2u7PugEHX3QkenudD6aXCkDQ4",
    },
  },
  // Future entries: sushiswap, aerodrome, pancakeswap, etc.
};

const DEFAULT_LP_DASH = {
  chain:    "All",
  risk:     "All",
  sortBy:   "score",
  search:   "",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function useIsMobile(bp = 768) {
  const [m, setM] = useState(window.innerWidth < bp);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return m;
}

const sectionLabel = (text, barColor = C.accent) => (
  <div style={{
    fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase",
    fontWeight: 900, background: barColor, padding: "5px 16px", margin: "-16px -16px 12px -16px",
  }}>
    {text}
  </div>
);

const fmtDollar = v => (v >= 0 ? "+$" : "-$") + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 2);
const fmtPct = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fmtCompact = v => {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
};

// Re-export helpers from lpHelpers.js so the rest of this file can use them unqualified
const feeTierFromPool = feeTierFromPoolHelper;

const parseTokens = (symbol) => {
  if (!symbol) return ["?", "?"];
  return symbol.split(/[-\/]/).slice(0, 2).map(t => t.trim());
};

const truncateAddr = (addr) => {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
};

// ─── Subgraph fetch (for expanded row deep dive) ───────────────────────────

async function fetchSubgraphPoolData(chain, poolAddress) {
  const apiKey = import.meta.env.VITE_GRAPH_API_KEY;
  const subgraphId = DEX_REGISTRY["uniswap-v3"].subgraphIds[chain];
  if (!apiKey || !subgraphId || !poolAddress) return null;

  const url = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;

  const query = `{
    pool(id: "${poolAddress.toLowerCase()}") {
      token0Price
      token1Price
      feeTier
      liquidity
      sqrtPrice
      tick
    }
    poolDayDatas(
      first: 90
      orderBy: date
      orderDirection: desc
      where: { pool: "${poolAddress.toLowerCase()}" }
    ) {
      date
      volumeUSD
      tvlUSD
      feesUSD
      close: token0Price
    }
  }`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    return data.data || null;
  } catch (e) {
    console.error("Subgraph fetch failed:", e);
    return null;
  }
}


// ─── Chart Tooltip ──────────────────────────────────────────────────────────

function PoolChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: "#0d1629", border: "1px solid " + C.border, borderRadius: 4,
      padding: "10px 14px", fontSize: 11,
    }}>
      <div style={{ color: C.dim, marginBottom: 6, fontWeight: 600 }}>{d.date}</div>
      {d.apy != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 3 }}>
          <span style={{ color: C.green }}>APY</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.green }}>{d.apy.toFixed(2)}%</span>
        </div>
      )}
      {d.tvl != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: C.accent }}>TVL</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.accent }}>
            {d.tvl >= 1e6 ? "$" + (d.tvl / 1e6).toFixed(1) + "M" : "$" + (d.tvl / 1e3).toFixed(0) + "K"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function LPYield() {
  const [cfg, setCfg] = useUrlState(DEFAULT_LP_DASH);
  const set = k => v => setCfg(prev => ({ ...prev, [k]: v }));
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);

  // Top-100 CMC token set (from CoinGecko, fetched once on mount)
  const [top100Set, setTop100Set] = useState(TOP100_FALLBACK);

  // Pool data
  const [rawPools, setRawPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingChains, setPendingChains] = useState(0);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  // Expanded row state
  const [expandedId, setExpandedId] = useState(null);
  const [expandCapital, setExpandCapital] = useState(10000);
  const [expandDays, setExpandDays] = useState(30);
  const [subgraphData, setSubgraphData] = useState(null);
  const [subgraphLoading, setSubgraphLoading] = useState(false);

  // Show count (pagination)
  const [showCount, setShowCount] = useState(50);

  // ── Fetch top-100 CMC tokens from CoinGecko (once on mount) ──────────
  useEffect(() => {
    async function fetchTop100() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1"
        );
        if (!res.ok) return; // fall back to hardcoded list
        const coins = await res.json();
        const symbols = new Set(coins.map(c => c.symbol?.toUpperCase()).filter(Boolean));
        if (symbols.size > 0) setTop100Set(symbols);
      } catch {
        // silently use fallback
      }
    }
    fetchTop100();
  }, []);

  // ── Fetch pools from GeckoTerminal — streams results per chain ───────
  const loadPools = useCallback(async () => {
    const gecko = DEX_REGISTRY["uniswap-v3"].geckoTerminal;
    const chains = Object.entries(gecko);

    // On first load show full spinner; on refresh keep existing data visible
    if (rawPools.length === 0) setLoading(true);
    setRawPools([]);
    setPendingChains(chains.length);
    setError(null);

    const fetchChain = async ([chain, { network, dex }]) => {
      const url = `https://api.geckoterminal.com/api/v2/networks/${network}/dexes/${dex}/pools?sort=h24_volume_usd_desc&page=1`;
      try {
        const res = await fetch(url, { headers: { Accept: "application/json;version=20230302" } });
        const json = await res.json();
        const pools = (json.data || []).flatMap(pool => {
          const attrs = pool.attributes;
          const tvl = parseFloat(attrs.reserve_in_usd) || 0;
          const vol24 = parseFloat(attrs.volume_usd?.h24) || 0;
          const feeRate = parseFeeFromGeckoName(attrs.name);
          const apy = tvl > 0 ? (vol24 * feeRate * 365 / tvl) * 100 : 0;
          if (tvl < 1_000_000 || apy <= 0) return [];
          return [{
            pool: attrs.address,
            symbol: parseSymbolFromGeckoName(attrs.name),
            chain,
            project: "uniswap-v3",
            tvlUsd: tvl,
            volumeUsd1d: vol24,
            apy,
            apyBase: apy,
            feeTier: Math.round(feeRate * 1_000_000),
            il7d: 0,
          }];
        });
        // Merge incrementally — dedup by pool address
        setRawPools(prev => {
          const seen = new Set(prev.map(p => p.pool));
          return [...prev, ...pools.filter(p => !seen.has(p.pool))];
        });
      } catch (e) {
        console.error(`Failed to fetch ${chain}:`, e);
      } finally {
        setPendingChains(prev => prev - 1);
      }
    };

    await Promise.allSettled(chains.map(fetchChain));
    setLoading(false);
    setLastFetched(new Date());
  }, [rawPools.length]);

  // Initial fetch + 10-min polling
  useEffect(() => {
    loadPools();
    const interval = setInterval(loadPools, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ranked & filtered pools ───────────────────────────────────────────
  const rankedPools = useMemo(() => rankPools(rawPools, top100Set), [rawPools, top100Set]);

  const filteredPools = useMemo(() => {
    // Top-100 gate: both tokens must be in top-100 or stablecoins
    // (stablecoins handled by classifyPool; here we filter out "exotic" pools that slipped through)
    let pools = rankedPools.filter(p => p._type !== "exotic" || cfg.risk === "Aggressive" || cfg.risk === "All");

    // More precise top-100 gate: reject pools where NEITHER token is top-100/stable
    const STABLECOINS_UPPER = [
      "USDC","USDT","DAI","FRAX","LUSD","BUSD","TUSD","PYUSD","GHO",
      "EURC","CRVUSD","SDAI","USDD","USDP","GUSD","RAI","MIM","DOLA",
      "USDBC","USD+","USDC.E","USDE","SUSDE","FDUSD","AUSD",
    ];
    pools = pools.filter(p => {
      const tokens = (p.symbol || "").toUpperCase().split(/[-\/]/);
      return tokens.some(tok =>
        STABLECOINS_UPPER.some(s => tok.includes(s)) ||
        [...top100Set].some(s => tok.includes(s))
      );
    });

    // Chain filter
    if (cfg.chain !== "All") {
      pools = pools.filter(p => p.chain?.toLowerCase() === cfg.chain.toLowerCase());
    }

    // Risk appetite filter
    const appetite = RISK_APPETITES.find(r => r.key === cfg.risk) || RISK_APPETITES[0];
    if (cfg.risk !== "All") {
      pools = pools.filter(p => appetite.types.includes(p._type));
    }

    // Search filter
    if (cfg.search) {
      const q = cfg.search.toLowerCase();
      pools = pools.filter(p => p.symbol?.toLowerCase().includes(q));
    }

    // Sort — group by pool type first (stable → major → exotic), then by selected sort within each group
    const typeOrder = { stable: 0, major: 1, exotic: 2 };
    const sortFn = cfg.sortBy === "apy" ? (a, b) => (b.apy || 0) - (a.apy || 0)
      : cfg.sortBy === "tvl" ? (a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0)
      : cfg.sortBy === "vol" ? (a, b) => (b.volumeUsd1d || 0) - (a.volumeUsd1d || 0)
      : (a, b) => b._score - a._score; // default: score

    pools = [...pools].sort((a, b) => {
      const typeDiff = (typeOrder[a._type] || 2) - (typeOrder[b._type] || 2);
      if (typeDiff !== 0) return typeDiff;
      return sortFn(a, b);
    });

    return pools;
  }, [rankedPools, cfg.chain, cfg.risk, cfg.search, cfg.sortBy]);

  const topPool = rankedPools.length > 0 ? rankedPools[0] : null;
  const displayPools = filteredPools.slice(0, showCount);

  // ── Expanded row analysis ─────────────────────────────────────────────
  const expandedPool = expandedId ? filteredPools.find(p => p.pool === expandedId) : null;

  const expandedAnalysis = useMemo(() => {
    if (!expandedPool) return null;

    const tokens = parseTokens(expandedPool.symbol);
    const feeRate = feeTierFromPool(expandedPool);
    const poolTvl = expandedPool.tvlUsd || 0;
    const dailyVolume = expandedPool.volumeUsd1d || (expandedPool.volumeUsd7d || 0) / 7;

    // For the table, use V2 model (simpler, doesn't need price range)
    const ilTable = computeILTable("v2", {
      capital: expandCapital,
      poolTvl,
      dailyVolume,
      feeRate,
      days: expandDays,
      currentPrice: 1, rangeLower: 0.5, rangeUpper: 1.5,
    });

    // Net yield at 0% price change (pure fee income)
    const yieldAtFlat = computeNetYield_V2({
      capital: expandCapital, poolTvl, dailyVolume, feeRate,
      days: expandDays, priceChangeRatio: 1,
    });

    // IL at 10% move
    const yieldAt10 = computeNetYield_V2({
      capital: expandCapital, poolTvl, dailyVolume, feeRate,
      days: expandDays, priceChangeRatio: 1.10,
    });

    // Sweet spot from subgraph data
    let sweetSpot = null;
    if (subgraphData?.poolDayDatas) {
      const currentPrice = parseFloat(subgraphData.pool?.token0Price || 1);
      sweetSpot = computeSweetSpot(currentPrice, subgraphData.poolDayDatas);
    }

    return {
      tokens, feeRate, poolTvl, dailyVolume,
      ilTable, yieldAtFlat, yieldAt10, sweetSpot,
    };
  }, [expandedPool, expandCapital, expandDays, subgraphData]);

  // Fetch subgraph data when expanding a row (chart data included in same response)
  const handleExpand = useCallback(async (pool) => {
    if (expandedId === pool.pool) {
      setExpandedId(null);
      setSubgraphData(null);
      return;
    }

    setExpandedId(pool.pool);
    setSubgraphData(null);
    setSubgraphLoading(true);

    const sgData = await fetchSubgraphPoolData(pool.chain, pool.pool);
    setSubgraphData(sgData);
    setSubgraphLoading(false);
  }, [expandedId]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'IBM Plex Mono','Courier New',monospace",
      background: C.bg, minHeight: "100vh", color: C.text,
      padding: isMobile ? "16px 12px 60px" : "28px 20px 60px",
    }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <div style={{
          fontSize: 10, color: C.dim, marginBottom: 20, letterSpacing: "0.1em",
          borderBottom: "1px solid " + C.border, paddingBottom: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.accent, fontWeight: 700 }}>FREN LABS</span>
            <span>›</span>
            <span>LP YIELD DASHBOARD</span>
            <span style={{ color: C.green }}>● LIVE</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {lastFetched && !isMobile && (
              <span style={{ fontSize: 9, color: C.muted }}>
                Updated {lastFetched.toLocaleTimeString()} · Auto-refresh 10m
              </span>
            )}
            <button onClick={handleCopy} style={{
              background: "none", border: "1px solid " + C.border, color: copied ? C.green : C.dim,
              fontSize: 10, padding: "2px 10px", cursor: "pointer", fontFamily: "monospace",
            }}>{copied ? "COPIED" : "SHARE"}</button>
            <button onClick={loadPools} style={{
              background: "none", border: "1px solid " + C.border, color: C.dim,
              fontSize: 10, padding: "2px 10px", cursor: "pointer", fontFamily: "monospace",
            }}>REFRESH</button>
          </div>
        </div>

        {/* ── Title ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: "0.06em", color: C.text }}>
            LP YIELD DASHBOARD
          </h1>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
            Live Uniswap V3 pool opportunities ranked by risk-adjusted score. Click any row for full analysis.
          </div>
        </div>

        {/* ── Featured Opportunity ───────────────────────────────────── */}
        {topPool && !loading && (
          <div
            onClick={() => handleExpand(topPool)}
            style={{
              background: C.panel, border: "1px solid " + C.accent, padding: 16, marginBottom: 20,
              cursor: "pointer", transition: "border-color 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.green}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.accent}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                fontSize: 9, letterSpacing: "0.12em", fontWeight: 900, color: "#000",
                background: C.green, padding: "2px 8px", textTransform: "uppercase",
              }}>BEST OPPORTUNITY</span>
              <span style={{
                fontSize: 9, letterSpacing: "0.1em", color: C.muted,
              }}>#{1} BY COMPOSITE SCORE</span>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: isMobile ? 8 : 24,
              flexWrap: "wrap",
            }}>
              <div style={{ fontSize: isMobile ? 13 : 16, fontWeight: 900, color: C.text }}>{topPool.symbol}</div>
              <div style={{ fontSize: isMobile ? 10 : 12, color: C.dim }}>{topPool.chain}</div>
              <div style={{ fontSize: isMobile ? 12 : 14, fontWeight: 800, color: C.green, fontFamily: "monospace" }}>
                {(topPool.apy || 0).toFixed(1)}% APY
              </div>
              {!isMobile && (
                <div style={{ fontSize: 12, color: C.accent, fontFamily: "monospace" }}>
                  {fmtCompact(topPool.tvlUsd || 0)} TVL
                </div>
              )}
              <div style={{
                fontSize: isMobile ? 12 : 14, fontWeight: 900, color: gradeColor(topPool._grade),
                border: "1px solid " + gradeColor(topPool._grade),
                padding: "2px 10px", fontFamily: "monospace",
              }}>
                {topPool._grade}
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginLeft: "auto" }}>
                {isMobile ? "Tap to analyze →" : "Click to analyze →"}
              </div>
            </div>
          </div>
        )}

        {/* ── Filter Bar ─────────────────────────────────────────────── */}
        <div style={{
          display: "flex", flexDirection: isMobile ? "column" : "row",
          gap: 12, marginBottom: 16, alignItems: isMobile ? "stretch" : "center",
        }}>
          {/* Chain tabs */}
          <div style={{
            display: "flex", gap: 0, overflowX: "auto", flexShrink: 0,
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}>
            {ALL_CHAINS.map(chain => (
              <button key={chain} onClick={() => set("chain")(chain)} style={{
                background: cfg.chain === chain ? C.accent : "transparent",
                color: cfg.chain === chain ? "#000" : C.dim,
                border: "1px solid " + (cfg.chain === chain ? C.accent : C.border),
                borderRight: "none",
                fontSize: isMobile ? 9 : 10, padding: isMobile ? "5px 7px" : "5px 10px",
                cursor: "pointer", fontFamily: "monospace",
                fontWeight: cfg.chain === chain ? 800 : 500,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>{chain}</button>
            ))}
            <div style={{ borderRight: "1px solid " + C.border }} />
          </div>

          {/* Risk appetite */}
          <div style={{
            display: "flex", gap: 0, flexShrink: 0, overflowX: "auto",
            WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
          }}>
            {RISK_APPETITES.map(r => (
              <button key={r.key} onClick={() => set("risk")(r.key)}
                title={r.desc}
                style={{
                  background: cfg.risk === r.key ? r.color + "22" : "transparent",
                  color: cfg.risk === r.key ? r.color : C.dim,
                  border: "1px solid " + (cfg.risk === r.key ? r.color : C.border),
                  borderRight: "none",
                  fontSize: isMobile ? 9 : 10, padding: isMobile ? "5px 6px" : "5px 10px",
                  cursor: "pointer", fontFamily: "monospace",
                  fontWeight: cfg.risk === r.key ? 800 : 500,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>{isMobile ? r.key.toUpperCase().slice(0, 4) : r.label}</button>
            ))}
            <div style={{ borderRight: "1px solid " + C.border }} />
          </div>

          {/* Search */}
          <input
            type="text"
            value={cfg.search}
            onChange={e => set("search")(e.target.value)}
            placeholder="Search token..."
            style={{
              background: C.panel, border: "1px solid " + C.border,
              color: C.text, padding: "5px 10px", fontSize: 11,
              fontFamily: "monospace", outline: "none", flex: 1, minWidth: 120,
            }}
          />
        </div>

        {/* ── Pool Count + Stats ──────────────────────────────────────── */}
        <div style={{
          fontSize: 10, color: C.muted, marginBottom: 12,
          display: "flex", gap: isMobile ? 8 : 16, alignItems: "center",
          flexWrap: "wrap",
        }}>
          <span>{filteredPools.length} pools</span>
          <span>·</span>
          <span>TVL: {fmtCompact(filteredPools.reduce((s, p) => s + (p.tvlUsd || 0), 0))}</span>
          {rawPools.length > 0 && !isMobile && (
            <>
              <span>·</span>
              <span>{rawPools.length} V3 pools tracked</span>
            </>
          )}
          {pendingChains > 0 && (
            <span style={{ color: C.accent }}>· loading {pendingChains} more chain{pendingChains > 1 ? "s" : ""}...</span>
          )}
        </div>

        {/* ── Loading / Error ─────────────────────────────────────────── */}
        {loading && (
          <div style={{
            background: C.panel, border: "1px solid " + C.border, padding: 40,
            textAlign: "center", fontSize: 12, color: C.dim,
          }}>
            Fetching live pool data from GeckoTerminal...
          </div>
        )}

        {error && !loading && (
          <div style={{
            background: C.panel, border: "1px solid " + C.red, padding: 16,
            fontSize: 11, color: C.red, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* ── Pool Table ──────────────────────────────────────────────── */}
        {!loading && displayPools.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid " + C.border }}>
                  {(isMobile
                    ? [{ key: "rank", label: "#" }, { key: "pool", label: "Pool" }, { key: "apy", label: "APY" }, { key: "score", label: "Score" }]
                    : [
                        { key: "rank", label: "#" },
                        { key: "pool", label: "Pool" },
                        { key: "chain", label: "Chain" },
                        { key: "fee", label: "Fee" },
                        { key: "tvl", label: "TVL" },
                        { key: "apy", label: "APY" },
                        { key: "vol", label: "24h Vol" },
                        { key: "score", label: "Score" },
                      ]
                  ).map(col => {
                    const isSortable = SORT_OPTIONS.some(s => s.key === col.key);
                    return (
                      <th key={col.key}
                        onClick={isSortable ? () => set("sortBy")(col.key) : undefined}
                        style={{
                          textAlign: col.key === "pool" ? "left" : "right",
                          padding: "8px 8px", color: cfg.sortBy === col.key ? C.accent : C.dim,
                          fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                          cursor: isSortable ? "pointer" : "default",
                          userSelect: "none", whiteSpace: "nowrap",
                        }}
                      >
                        {col.label}{cfg.sortBy === col.key ? " ↓" : ""}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayPools.map((pool, i) => {
                  const isExpanded = expandedId === pool.pool;
                  const gc = gradeColor(pool._grade);
                  const poolIndex = filteredPools.indexOf(pool) + 1;
                  const prevType = i > 0 ? displayPools[i - 1]._type : null;
                  const showGroupHeader = pool._type !== prevType;

                  const groupMeta = {
                    stable: { label: "STABLE POOLS", sub: "Minimal IL · Stablecoin pairs", color: C.green },
                    major:  { label: "MAJOR POOLS",  sub: "Blue-chip & CEX-listed tokens", color: C.amber },
                    exotic: { label: "EXOTIC POOLS", sub: "Higher risk · DEX-only & low-cap tokens", color: C.red },
                  };
                  const gm = groupMeta[pool._type] || groupMeta.exotic;

                  return (
                    <React.Fragment key={pool.pool}>
                      {showGroupHeader && (
                        <tr>
                          <td colSpan={isMobile ? 4 : 8} style={{
                            padding: isMobile ? "10px 6px 4px" : "12px 8px 6px", background: C.bg,
                            borderBottom: "1px solid " + gm.color + "44",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{
                                fontSize: isMobile ? 9 : 10, fontWeight: 900, letterSpacing: "0.12em",
                                color: gm.color,
                              }}>
                                {gm.label}
                              </span>
                              {!isMobile && <span style={{ fontSize: 9, color: C.muted }}>{gm.sub}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                      <PoolRow
                        pool={pool}
                        index={poolIndex}
                        isExpanded={isExpanded}
                        isMobile={isMobile}
                        gc={gc}
                        onExpand={() => handleExpand(pool)}
                        expandedAnalysis={isExpanded ? expandedAnalysis : null}
                        expandCapital={expandCapital}
                        setExpandCapital={setExpandCapital}
                        expandDays={expandDays}
                        setExpandDays={setExpandDays}
                        subgraphLoading={subgraphLoading}
                        subgraphData={isExpanded ? subgraphData : null}
                      />
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No results */}
        {!loading && filteredPools.length === 0 && rawPools.length > 0 && (
          <div style={{
            background: C.panel, border: "1px solid " + C.border, padding: 40,
            textAlign: "center", fontSize: 12, color: C.dim,
          }}>
            No pools match your filters. Try adjusting chain, pool type, or search.
          </div>
        )}

        {/* Show more */}
        {filteredPools.length > showCount && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button onClick={() => setShowCount(s => s + 50)} style={{
              background: "none", border: "1px solid " + C.border, color: C.dim,
              fontSize: 10, padding: "6px 24px", cursor: "pointer", fontFamily: "monospace",
            }}>
              SHOW MORE ({filteredPools.length - showCount} remaining)
            </button>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div style={{
          marginTop: 24, fontSize: 9, color: C.muted, lineHeight: 1.8,
          borderTop: "1px solid " + C.border, paddingTop: 12, letterSpacing: "0.06em",
        }}>
          Pool data via GeckoTerminal · Sweet spot analysis via The Graph (optional) ·
          FOR EDUCATIONAL PURPOSES ONLY · NOT FINANCIAL ADVICE
        </div>

      </div>
    </div>
  );
}

// ─── Pool Row Component ─────────────────────────────────────────────────────

function PoolRow({
  pool, index, isExpanded, isMobile, gc, onExpand,
  expandedAnalysis, expandCapital, setExpandCapital,
  expandDays, setExpandDays, subgraphLoading, subgraphData,
}) {
  const [hovered, setHovered] = useState(false);

  const typeBadgeColor = pool._type === "stable" ? C.green
    : pool._type === "major" ? C.accent : C.muted;

  // Extract fee tier display
  const feeDisplay = (() => {
    const sym = pool.symbol || "";
    const match = sym.match(/(\d+\.?\d*%)/);
    if (match) return match[1];
    // Try from pool metadata
    const tier = feeTierFromPool(pool);
    return (tier * 100).toFixed(2) + "%";
  })();

  return (
    <>
      <tr
        onClick={onExpand}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderBottom: "1px solid " + C.border,
          background: isExpanded ? C.accent + "12" : hovered ? "#111" : "transparent",
          cursor: "pointer", transition: "background 0.15s",
        }}
      >
        {/* Rank */}
        <td style={{ padding: "8px 8px", textAlign: "right", color: C.muted, fontFamily: "monospace", fontSize: 10 }}>
          {index}
        </td>

        {/* Pool name */}
        <td style={{ padding: "8px 8px", textAlign: "left", maxWidth: isMobile ? 140 : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontWeight: 700, color: C.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              maxWidth: isMobile ? 100 : "none", display: "inline-block",
              fontSize: isMobile ? 10 : 11,
            }}>{pool.symbol}</span>
            {!isMobile && (
              <span style={{
                fontSize: 8, padding: "1px 5px", border: "1px solid " + typeBadgeColor,
                color: typeBadgeColor, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                {pool._type}
              </span>
            )}
          </div>
          {!isMobile && pool.pool && (() => {
            const url = DEX_REGISTRY["uniswap-v3"].poolUrl(pool.chain, pool.pool);
            return url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: 9, color: C.muted, fontFamily: "monospace",
                  textDecoration: "none", display: "block", marginTop: 2,
                  letterSpacing: "0.03em",
                }}
                onMouseEnter={e => e.currentTarget.style.color = C.accent}
                onMouseLeave={e => e.currentTarget.style.color = C.muted}
              >
                {truncateAddr(pool.pool)}
              </a>
            ) : null;
          })()}
        </td>

        {!isMobile && (
          <>
            {/* Chain */}
            <td style={{ padding: "8px 8px", textAlign: "right", color: C.dim, fontSize: 10 }}>
              {pool.chain}
            </td>
            {/* Fee */}
            <td style={{ padding: "8px 8px", textAlign: "right", color: C.muted, fontFamily: "monospace" }}>
              {feeDisplay}
            </td>
            {/* TVL */}
            <td style={{ padding: "8px 8px", textAlign: "right", color: C.accent, fontFamily: "monospace" }}>
              {fmtCompact(pool.tvlUsd || 0)}
            </td>
          </>
        )}

        {/* APY */}
        <td style={{
          padding: "8px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700,
          color: (pool.apy || 0) > 20 ? C.green : (pool.apy || 0) > 5 ? C.accent : C.dim,
        }}>
          {(pool.apy || 0).toFixed(1)}%
        </td>

        {!isMobile && (
          /* 24h Volume */
          <td style={{ padding: "8px 8px", textAlign: "right", color: C.dim, fontFamily: "monospace" }}>
            {fmtCompact(pool.volumeUsd1d || 0)}
          </td>
        )}

        {/* Score */}
        <td style={{ padding: "8px 8px", textAlign: "right" }}>
          <span style={{
            fontWeight: 900, color: gc, border: "1px solid " + gc,
            padding: "2px 8px", fontFamily: "monospace", fontSize: 11,
          }}>
            {pool._grade}
          </span>
        </td>
      </tr>

      {/* ── Expanded Analysis ─────────────────────────────────────── */}
      {isExpanded && (
        <tr>
          <td colSpan={isMobile ? 4 : 8} style={{ padding: 0, background: C.panel }}>
            <ExpandedPanel
              pool={pool}
              analysis={expandedAnalysis}
              capital={expandCapital}
              setCapital={setExpandCapital}
              days={expandDays}
              setDays={setExpandDays}
              isMobile={isMobile}
              subgraphLoading={subgraphLoading}
              subgraphData={subgraphData}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Expanded Panel ─────────────────────────────────────────────────────────

function ExpandedPanel({ pool, analysis, capital, setCapital, days, setDays, isMobile, subgraphLoading, subgraphData }) {
  if (!analysis) return null;

  const { tokens, feeRate, ilTable, yieldAtFlat, yieldAt10, sweetSpot } = analysis;
  const [addrCopied, setAddrCopied] = useState(false);
  const uniswapUrl = DEX_REGISTRY["uniswap-v3"].poolUrl(pool.chain, pool.pool);

  const handleCopyAddr = () => {
    if (!pool.pool) return;
    navigator.clipboard.writeText(pool.pool);
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 1500);
  };

  // Transform subgraph poolDayDatas into chart-ready format
  const poolChartData = useMemo(() => {
    const dds = subgraphData?.poolDayDatas;
    if (!dds || !dds.length) return null;
    // poolDayDatas comes desc (newest first) — reverse for chronological chart
    return [...dds].reverse().map(d => ({
      date: new Date(d.date * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      apy: parseFloat(d.tvlUSD) > 0 ? (parseFloat(d.feesUSD) / parseFloat(d.tvlUSD)) * 365 * 100 : 0,
      tvl: parseFloat(d.tvlUSD) || 0,
    }));
  }, [subgraphData]);

  return (
    <div style={{
      padding: 16, borderTop: "2px solid " + C.accent,
      borderBottom: "2px solid " + C.accent,
    }}>
      {/* ── Pool Identity ─────────────────────────────────────────── */}
      {pool.pool && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 9, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Pool
          </span>
          <code style={{ fontSize: 10, color: C.dim, fontFamily: "monospace", wordBreak: "break-all" }}>
            {pool.pool}
          </code>
          <button
            onClick={handleCopyAddr}
            style={{
              background: "none", border: "1px solid " + C.border, color: addrCopied ? C.green : C.muted,
              fontSize: 9, padding: "2px 8px", cursor: "pointer", fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}
          >{addrCopied ? "COPIED" : "COPY"}</button>
          {uniswapUrl && (
            <a
              href={uniswapUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", color: "#000",
                background: C.accent, padding: "3px 12px", textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              OPEN ON UNISWAP ↗
            </a>
          )}
        </div>
      )}

      {/* ── 3 Stat Cards ─────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
        gap: 10, marginBottom: 16,
      }}>
        <StatCard
          label="Fee APR"
          value={yieldAtFlat.feeApr.toFixed(1) + "%"}
          sub={`${days}d horizon · ${(feeRate * 100).toFixed(2)}% tier`}
          color={yieldAtFlat.feeApr > 10 ? C.green : C.accent}
        />
        <StatCard
          label="IL at +10%"
          value={fmtPct(yieldAt10.ilPct * 100)}
          sub={fmtDollar(yieldAt10.ilDollar)}
          color={C.red}
        />
        <StatCard
          label="Net Yield"
          value={fmtDollar(yieldAtFlat.netPnl)}
          sub={fmtPct(yieldAtFlat.netPct * 100) + " return"}
          color={yieldAtFlat.netPnl >= 0 ? C.green : C.red}
        />
      </div>

      {/* ── Pool Chart (APY + TVL history) ───────────────────────── */}
      {subgraphLoading && (
        <div style={{
          background: C.bg, border: "1px solid " + C.border, padding: 40, marginBottom: 16,
          fontSize: 11, color: C.dim, textAlign: "center",
        }}>
          Loading pool history...
        </div>
      )}

      {poolChartData && !subgraphLoading && (
        <div style={{ background: C.bg, border: "1px solid " + C.border, padding: 16, marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase",
            fontWeight: 900, background: C.green, padding: "5px 16px",
            margin: "-16px -16px 12px -16px",
          }}>
            POOL HISTORY · {tokens[0]}/{tokens[1]} · {pool.chain} · LAST {poolChartData.length} DAYS
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
            <ComposedChart data={poolChartData} margin={{ top: 10, right: isMobile ? 4 : 10, bottom: 5, left: isMobile ? -4 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: isMobile ? 8 : 9, fill: C.dim }}
                interval={Math.max(Math.floor(poolChartData.length / (isMobile ? 5 : 8)), 1)}
              />
              <YAxis
                yAxisId="apy" orientation="left"
                tick={{ fontSize: isMobile ? 8 : 9, fill: C.green }}
                tickFormatter={v => v.toFixed(0) + "%"}
                width={isMobile ? 32 : 45}
              />
              {!isMobile && (
                <YAxis
                  yAxisId="tvl" orientation="right"
                  tick={{ fontSize: 9, fill: C.accent }}
                  tickFormatter={v => v >= 1e6 ? (v / 1e6).toFixed(0) + "M" : (v / 1e3).toFixed(0) + "K"}
                  width={50}
                />
              )}
              <Tooltip content={<PoolChartTooltip />} />
              {!isMobile && (
                <Area
                  yAxisId="tvl" type="monotone" dataKey="tvl" name="TVL"
                  fill={C.accent + "18"} stroke={C.accent} strokeWidth={1}
                />
              )}
              <Line
                yAxisId="apy" type="monotone" dataKey="apy" name="APY"
                stroke={C.green} strokeWidth={2} dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 6 }}>
            <span style={{ fontSize: 10, color: C.green }}>── APY %</span>
            {!isMobile && <span style={{ fontSize: 10, color: C.accent }}>▓ TVL</span>}
          </div>
        </div>
      )}

      {/* ── Capital & Time Inputs ────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 12, marginBottom: 16,
      }}>
        <div style={{ background: C.bg, border: "1px solid " + C.border, padding: 12 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>
            LP Capital
          </div>
          <CapitalInput value={capital} onChange={setCapital} />
        </div>
        <div style={{ background: C.bg, border: "1px solid " + C.border, padding: 12 }}>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>
            Time Horizon
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[7, 30, 90, 180, 365].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{
                background: days === d ? C.accent + "22" : "transparent",
                border: "1px solid " + (days === d ? C.accent : C.border),
                color: days === d ? C.accent : C.dim,
                fontSize: 10, padding: "4px 10px", cursor: "pointer",
                fontFamily: "monospace", fontWeight: 600,
              }}>{d}d</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sweet Spot Range (from subgraph data) ────────────────── */}
      {subgraphLoading && (
        <div style={{
          background: C.bg, border: "1px solid " + C.border, padding: 16, marginBottom: 16,
          fontSize: 11, color: C.dim, textAlign: "center",
        }}>
          Loading subgraph data for sweet spot analysis...
        </div>
      )}

      {sweetSpot && !subgraphLoading && (
        <div style={{ background: C.bg, border: "1px solid " + C.amber, padding: 16, marginBottom: 16 }}>
          <div style={{
            fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase",
            fontWeight: 900, background: C.amber, padding: "5px 16px",
            margin: "-16px -16px 12px -16px",
          }}>
            SWEET SPOT RANGE (V3)
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",
            gap: 12, textAlign: "center",
          }}>
            <div>
              <div style={{ fontSize: 9, color: C.dim, marginBottom: 4 }}>RANGE LOWER</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "monospace" }}>
                ${sweetSpot.rangeLower.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.dim, marginBottom: 4 }}>RANGE UPPER</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, fontFamily: "monospace" }}>
                ${sweetSpot.rangeUpper.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.dim, marginBottom: 4 }}>EFFICIENCY</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.amber, fontFamily: "monospace" }}>
                {sweetSpot.expectedEfficiency}×
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.dim, marginBottom: 4 }}>CONFIDENCE</div>
              <div style={{
                fontSize: 14, fontWeight: 800, fontFamily: "monospace",
                color: sweetSpot.confidence === "high" ? C.green
                  : sweetSpot.confidence === "medium" ? C.amber : C.red,
              }}>
                {sweetSpot.confidence.toUpperCase()}
              </div>
            </div>
          </div>
          {sweetSpot.annualVol && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 8, textAlign: "center" }}>
              Based on {sweetSpot.dataPoints} days of price data · {sweetSpot.annualVol}% annualized volatility ·
              Range set at 1.5σ over 30 days
            </div>
          )}
        </div>
      )}

      {/* ── Stress Test Table ─────────────────────────────────────── */}
      <div style={{ background: C.bg, border: "1px solid " + C.border, padding: 16 }}>
        <div style={{
          fontSize: 10, color: "#000", letterSpacing: "0.12em", textTransform: "uppercase",
          fontWeight: 900, background: C.accent, padding: "5px 16px",
          margin: "-16px -16px 12px -16px",
        }}>
          IL STRESS TEST · {tokens[0]}/{tokens[1]}
        </div>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 10 : 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid " + C.border }}>
                {(isMobile
                  ? ["Price Δ", "IL %", "Fees", "Net"]
                  : ["Price Δ", "IL %", "IL $", "Fee Income", "Net P&L", "Net %"]
                ).map(h => (
                  <th key={h} style={{
                    textAlign: "right", padding: isMobile ? "5px 4px" : "6px 8px", color: C.dim,
                    fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ilTable.map((row, i) => (
                <tr key={i} style={{
                  borderBottom: "1px solid " + C.border,
                  background: row.changePct === 0 ? C.accent + "15" : "transparent",
                }}>
                  <td style={{ padding: isMobile ? "5px 4px" : "6px 8px", textAlign: "right", color: C.text, fontWeight: 700 }}>
                    {row.changePct > 0 ? "+" : ""}{row.changePct}%
                  </td>
                  <td style={{ padding: isMobile ? "5px 4px" : "6px 8px", textAlign: "right", color: C.red, fontFamily: "monospace" }}>
                    {row.ilPct.toFixed(2)}%
                  </td>
                  {!isMobile && (
                    <td style={{ padding: "6px 8px", textAlign: "right", color: C.red, fontFamily: "monospace" }}>
                      ${Math.abs(row.ilDollar).toFixed(0)}
                    </td>
                  )}
                  <td style={{ padding: isMobile ? "5px 4px" : "6px 8px", textAlign: "right", color: C.green, fontFamily: "monospace" }}>
                    +${row.feeIncome.toFixed(0)}
                  </td>
                  <td style={{ padding: isMobile ? "5px 4px" : "6px 8px", textAlign: "right", color: row.netPnl >= 0 ? C.green : C.red, fontWeight: 700, fontFamily: "monospace" }}>
                    {fmtDollar(row.netPnl)}
                  </td>
                  {!isMobile && (
                    <td style={{ padding: "6px 8px", textAlign: "right", color: row.netPct >= 0 ? C.green : C.red, fontFamily: "monospace" }}>
                      {fmtPct(row.netPct)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, textAlign: "right" }}>
          <button onClick={() => exportLPCsv(ilTable, {
            mode: "v3", tokenA: tokens[0], tokenB: tokens[1],
            capital, poolTvl: pool.tvlUsd || 0,
            dailyVolume: pool.volumeUsd1d || 0,
            feeRate: feeTierFromPool(pool), days,
            rangeLower: 0, rangeUpper: 0,
          })} style={{
            background: "none", border: "1px solid " + C.border, color: C.dim,
            fontSize: 10, padding: "4px 14px", cursor: "pointer", fontFamily: "monospace",
          }}>EXPORT CSV</button>
        </div>
      </div>
    </div>
  );
}
