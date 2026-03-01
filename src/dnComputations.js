import { C } from "./constants.js";

// ─── Markets ────────────────────────────────────────────────────────────────

export const MARKETS = [
  { coin: "ETH",  tier: 1, note: "Deepest liquidity, most stable funding. Default starting point." },
  { coin: "BTC",  tier: 1, note: "Equally liquid, funding lower but more stable." },
  { coin: "SOL",  tier: 2, note: "Higher avg funding in bull markets, can spike and compress fast." },
  { coin: "XRP",  tier: 2, note: "Hot during narrative cycles. Watch for abrupt reversals." },
  { coin: "DOGE", tier: 3, note: "Meme-driven spikes. Unreliable outside extreme sentiment." },
  { coin: "AVAX", tier: 2, note: "Moves with broader alt sentiment." },
  { coin: "LINK", tier: 2, note: "Steady trader base, less volatile than meme assets." },
  { coin: "SUI",  tier: 3, note: "Newer listing, thinner depth. Slippage risk is higher." },
  { coin: "HYPE", tier: 3, note: "Native token. High funding at launch cycles." },
  { coin: "WIF",  tier: 3, note: "Erratic funding. Short windows. Active monitoring required." },
];

// ─── Scenario reference rates ────────────────────────────────────────────────

export const SCENARIO_RATES = [
  { rate: -0.0010, label: "Negative",  signal: "exit",      context: "Current BTC · Feb 2026 example" },
  { rate:  0.0010, label: "Low",       signal: "low",       context: "Quiet market, low conviction" },
  { rate:  0.0050, label: "Moderate",  signal: "moderate",  context: "ETH / BTC in mild bull market" },
  { rate:  0.0100, label: "Strong",    signal: "strong",    context: "Active bull market — ETH / SOL" },
  { rate:  0.0300, label: "Very High", signal: "very-high", context: "SOL / XRP during narrative cycle" },
  { rate:  0.0500, label: "Spike",     signal: "spike",     context: "Don't chase. Rate will compress." },
];

// ─── Signal label ────────────────────────────────────────────────────────────

export function getSignalLabel(hourlyRateDecimal) {
  const apr = hourlyRateDecimal * 24 * 365 * 100;
  if (hourlyRateDecimal < 0)  return "exit";
  if (apr < 10)               return "low";
  if (apr < 50)               return "moderate";
  if (apr < 150)              return "strong";
  if (apr < 300)              return "very-high";
  return "spike";
}

// ─── Carry computation ───────────────────────────────────────────────────────

export function computeCarry(cfg, rateDecimal) {
  const { capital, mode, leverage, borrowRate } = cfg;
  const lev = mode === "leveraged" ? Math.max(leverage, 1) : 1;
  const position = capital * lev;
  const borrowed  = capital * (lev - 1);

  // Funding collected on full position (hourly)
  const hourlyFunding = rateDecimal * position;

  // Borrow cost on borrowed portion only (APR → per-hour)
  const hourlyBorrow = mode === "leveraged"
    ? (borrowRate / 100 / 8760) * borrowed
    : 0;

  const hourlyNet   = hourlyFunding - hourlyBorrow;
  const dailyNet    = hourlyNet * 24;
  const monthlyNet  = dailyNet * 30;
  const annualNet   = dailyNet * 365;
  const netApr      = capital > 0 ? (annualNet / capital) * 100 : 0;

  const annualFundingGross = capital > 0
    ? (hourlyFunding * 24 * 365 / capital) * 100
    : 0;
  const annualBorrowCost = capital > 0
    ? (hourlyBorrow * 24 * 365 / capital) * 100
    : 0;

  return {
    hourlyNet, dailyNet, monthlyNet, annualNet, netApr,
    annualFundingGross, annualBorrowCost,
    position, borrowed,
    isPositive: hourlyNet >= 0,
  };
}

// ─── Scenario table ──────────────────────────────────────────────────────────

export function computeScenarios(cfg) {
  return SCENARIO_RATES.map(s => ({
    ...s,
    carry: computeCarry(cfg, s.rate),
  }));
}

// Closest scenario index for highlighting the live rate row
export function closestScenarioIndex(currentRate) {
  let minDiff = Infinity, idx = 0;
  SCENARIO_RATES.forEach((s, i) => {
    const diff = Math.abs(s.rate - currentRate);
    if (diff < minDiff) { minDiff = diff; idx = i; }
  });
  return idx;
}

// ─── Leveraged spot liquidation stress test ──────────────────────────────────

export function computeLevStress(collateral, debt, liqThresholdPct) {
  const drops = [0, -5, -10, -15, -20, -25, -30, -40, -50];
  const lt = liqThresholdPct / 100;
  return drops.map(drop => {
    const colVal = +(collateral * (1 + drop / 100)).toFixed(2);
    const hf = debt > 0 ? +((colVal * lt) / debt).toFixed(3) : 999;
    const bufferPct = hf < 999 && hf > 1
      ? +(((hf - 1) / hf) * 100).toFixed(1)
      : null;
    return { drop, colVal, hf, isLiq: hf < 1.0, bufferPct };
  });
}

// ─── Position recommendations ────────────────────────────────────────────────

const ACTION_STYLES = {
  "ENTER":     { color: C.green,  bg: "rgba(0,229,160,0.10)",  border: "rgba(0,229,160,0.30)" },
  "CONSIDER":  { color: C.accent, bg: "rgba(0,212,255,0.08)",  border: "rgba(0,212,255,0.25)" },
  "WAIT":      { color: C.amber,  bg: "rgba(245,166,35,0.08)", border: "rgba(245,166,35,0.25)" },
  "EXIT":      { color: C.red,    bg: "rgba(255,77,109,0.08)", border: "rgba(255,77,109,0.25)" },
};

export function getActionStyle(action) {
  return ACTION_STYLES[action] || ACTION_STYLES["WAIT"];
}

// Recommendation for a single market given live rate + user config
export function computeMarketRec(fr, tier, cfg) {
  const sig   = getSignalLabel(fr);
  const carry = computeCarry(cfg, fr);
  const apr   = fr * 24 * 365 * 100;

  // Negative funding — always exit regardless of mode
  if (sig === "exit") {
    return {
      action: "EXIT",
      reason: `Negative funding (${(fr * 100).toFixed(4)}%/hr) — you'd pay, not collect.`,
    };
  }

  // Leveraged mode: net carry (funding minus borrow cost) drives the call
  if (cfg.mode === "leveraged") {
    if (carry.netApr > 20) return {
      action: "ENTER",
      reason: `Net carry +${carry.netApr.toFixed(1)}% APR after ${cfg.borrowRate}% borrow cost. Strong spread at ${cfg.leverage}×.`,
    };
    if (carry.netApr > 8) return {
      action: "CONSIDER",
      reason: `Net carry +${carry.netApr.toFixed(1)}% APR — positive but thin. Watch for rate compression.`,
    };
    if (carry.netApr > 0) return {
      action: "WAIT",
      reason: `Net carry +${carry.netApr.toFixed(1)}% APR — marginal after borrow cost at ${cfg.leverage}×. Not worth the liquidation risk.`,
    };
    return {
      action: "EXIT",
      reason: `Net carry ${carry.netApr.toFixed(1)}% APR — borrow cost exceeds funding at ${cfg.leverage}×.`,
    };
  }

  // Standard mode: signal + market tier drive the call
  if (sig === "spike") return {
    action: "WAIT",
    reason: `Rate spike at +${apr.toFixed(1)}% APR — likely to compress within hours. Enter on sustained moderate conditions, not peaks.`,
  };

  if (sig === "strong" || sig === "very-high") {
    return tier <= 2
      ? { action: "ENTER",    reason: `Strong sustained funding (+${apr.toFixed(1)}% APR). ${tier === 1 ? "Tier 1 — deep liquidity, clean execution." : "Tier 2 — decent depth, watch spread on entry."}` }
      : { action: "CONSIDER", reason: `Strong funding (+${apr.toFixed(1)}% APR) but thin market. Slippage risk on entry and exit eats into yield.` };
  }

  if (sig === "moderate") {
    return tier === 1
      ? { action: "ENTER",    reason: `Sustained moderate funding (+${apr.toFixed(1)}% APR). Tier 1 — ideal entry conditions.` }
      : { action: "CONSIDER", reason: `Moderate funding (+${apr.toFixed(1)}% APR). Check spread and OI before committing.` };
  }

  // low
  return {
    action: "WAIT",
    reason: `Low funding (+${apr.toFixed(1)}% APR) — yield barely covers execution costs. Wait for clearer conditions.`,
  };
}

// Ranked recommendations across all markets
export function computeAllRecs(rates, cfg) {
  return MARKETS
    .map(({ coin, tier }) => {
      const fr = rates[coin]?.funding ?? null;
      if (fr === null) return null;
      const rec  = computeMarketRec(fr, tier, cfg);
      const apr  = fr * 24 * 365 * 100;
      const carry = computeCarry(cfg, fr);
      // Score: used for ranking (higher = better opportunity)
      const score = rec.action === "EXIT"    ? apr - 200
                  : rec.action === "WAIT"    ? Math.min(apr, 5)
                  : rec.action === "CONSIDER" ? apr + (tier === 1 ? 3 : 0)
                  :                            apr + (tier === 1 ? 6 : tier === 2 ? 3 : 0); // ENTER
      return { coin, tier, fr, apr, carry, ...rec, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// ─── Risk rating ─────────────────────────────────────────────────────────────

const SL = ["", "Aa3", "Baa2", "Ba2", "B2"];
const SC = ["", C.green, C.accent, C.amber, C.red];

const BANDS = [
  { max: 1.5, rating: "Aa2",  color: C.green,  desc: "High quality · Low risk" },
  { max: 2.0, rating: "Baa1", color: C.accent, desc: "Investment grade · Moderate risk" },
  { max: 2.5, rating: "Baa3", color: C.accent, desc: "Investment grade · Some speculative elements" },
  { max: 3.0, rating: "Ba2",  color: C.amber,  desc: "Speculative grade · Substantial risk" },
  { max: 3.5, rating: "Ba3",  color: C.amber,  desc: "Speculative · High vulnerability" },
  { max: 4.0, rating: "B2",   color: C.red,    desc: "Speculative · Subject to high risk" },
];

export function computeDnRating(cfg, rateDecimal, tier = 2) {
  const sig    = getSignalLabel(rateDecimal);
  const lev    = cfg.mode === "leveraged" ? cfg.leverage : 1;

  const factors = [
    {
      label: "Funding Signal",
      score: sig === "exit" ? 4 : sig === "spike" ? 3 : sig === "low" ? 3 : sig === "moderate" ? 2 : sig === "very-high" ? 2 : 1,
      desc: sig === "exit"      ? "Negative funding — you pay, not collect. Exit signal."
          : sig === "spike"     ? "Spike — rate likely to compress. Don't chase."
          : sig === "low"       ? "Low positive funding — marginal yield, marginal entry."
          : sig === "moderate"  ? "Moderate, sustained positive — solid entry zone."
          : sig === "very-high" ? "Very high — attractive but monitor for compression."
          :                       "Strong persistent positive funding — ideal conditions.",
    },
    {
      label: "Market Depth",
      score: tier === 1 ? 1 : tier === 2 ? 2 : 3,
      desc: tier === 1
        ? "ETH/BTC — deepest liquidity, tightest entry/exit spreads."
        : tier === 2
        ? "Mid-tier liquidity — spreads manageable, some slippage on large sizes."
        : "Thin market — higher execution risk, wider spreads on entry and exit.",
    },
    {
      label: "Liquidation Risk",
      score: cfg.mode === "standard" ? 1 : lev <= 2 ? 2 : lev <= 3 ? 3 : 4,
      desc: cfg.mode === "standard"
        ? "Standard 1× — no spot liquidation risk. Perp liquidation requires extreme price move."
        : lev <= 2
        ? `${lev}× leveraged — independent spot + perp liq thresholds. Monitor both.`
        : lev <= 3
        ? `${lev}× leveraged — liquidation buffer compresses significantly. Active monitoring required.`
        : `${lev}× leveraged — thin buffer. High liquidation risk in volatile conditions.`,
    },
    {
      label: "Rate Stability",
      score: sig === "exit" ? 4 : sig === "spike" ? 4 : sig === "very-high" ? 3 : sig === "low" ? 3 : 2,
      desc: sig === "exit" || sig === "spike"
        ? "Unstable or reversed conditions. Rate persistence is low."
        : sig === "low" || sig === "very-high"
        ? "Rate at an extreme — watch for mean reversion."
        : "Moderate sustained conditions — rate persistence is more reliable.",
    },
    {
      label: "Unwind Ease",
      score: cfg.mode === "standard" ? 1 : lev <= 2 ? 2 : 3,
      desc: cfg.mode === "standard"
        ? "Standard — close perp short and sell spot simultaneously. Clean unwind."
        : lev <= 2
        ? "Leveraged — unwind perp first, then spot. Sequenced, manageable."
        : "Higher leverage — sequenced unwind more critical. Panic exit can create delta exposure.",
    },
    {
      label: "Platform Risk",
      score: 2,
      desc: "Hyperliquid — on-chain, non-custodial perps. No CEX custody risk. Smart contract and validator risk remain.",
    },
  ];

  const avg  = factors.reduce((s, f) => s + f.score, 0) / factors.length;
  const band = BANDS.find(b => avg <= b.max) || BANDS[BANDS.length - 1];

  return {
    factors: factors.map(f => ({ ...f, rating: SL[f.score], color: SC[f.score] })),
    overall: band.rating,
    overallColor: band.color,
    overallDesc: band.desc,
  };
}
