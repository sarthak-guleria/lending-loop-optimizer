import { C } from "./constants.js";

// ─── Token Classification Lists ──────────────────────────────────────────────

const STABLECOIN_LIST = [
  "USDC", "USDT", "DAI", "FRAX", "LUSD", "BUSD", "TUSD", "PYUSD", "GHO",
  "EURC", "crvUSD", "sDAI", "USDD", "USDP", "GUSD", "RAI", "MIM", "DOLA",
  "USDbC", "USD+", "USDC.e", "USDe", "sUSDe", "FDUSD", "AUSD",
];

// Major tokens — anything with real liquidity on major CEXs (Coinbase, Binance, etc.)
const MAJOR_LIST = [
  "BTC", "WBTC", "tBTC", "cbBTC",
  "ETH", "WETH", "stETH", "wstETH", "cbETH", "rETH", "mETH", "swETH", "ezETH", "weETH", "ETHx",
  "BNB", "WBNB",
  "SOL", "WSOL", "mSOL", "jitoSOL", "bSOL",
  "XRP",
  "ADA",
  "DOGE",
  "AVAX", "WAVAX", "sAVAX",
  "TRX",
  "DOT",
  "LINK",
  "MATIC", "WMATIC", "POL", "stMATIC",
  "SHIB",
  "TON",
  "SUI",
  "NEAR",
  "APT",
  "UNI",
  "ICP",
  "LTC",
  "ATOM",
  "ARB",
  "OP",
  "FIL",
  "AAVE",
  "MKR",
  "RENDER",
  "INJ",
  "IMX",
  "HBAR",
  "SEI",
  "STX",
  "PEPE",
  "CRO",
  "ALGO",
  "FTM", "S",
  "GRT",
  "SNX",
  "LDO",
  "ONDO",
  "TIA",
  "JUP",
  "WIF",
  "BONK",
  "FLOKI",
  "WLD",
  "JASMY",
  "ENS",
  "PENDLE",
  "ENA",
  "EIGEN",
  "ZRO",
  "W",
  "STRK",
  "ZK",
  "MANTA",
  "PYTH",
  "TAO",
  "FET",
  "THETA",
  "SAND",
  "MANA",
  "AXS",
  "ENJ",
  "CRV",
  "COMP",
  "SUSHI",
  "1INCH",
  "CAKE",
  "GMX",
  "DYDX",
  "RPL",
  "MON",
];

// ─── V2 (Constant Product AMM) ─────────────────────────────────────────────

/**
 * Impermanent loss for a V2 (full-range) position.
 * priceChangeRatio = newPrice / oldPrice (e.g. 1.5 for +50%)
 * Returns negative number (loss), e.g. -0.057 for ~5.7% IL
 */
export function computeIL_V2(priceChangeRatio) {
  const r = priceChangeRatio;
  if (r <= 0) return -1; // total loss
  return 2 * Math.sqrt(r) / (1 + r) - 1;
}

/**
 * Projected fee income for a V2 LP position.
 * Share-of-pool model: your share of daily fees x days.
 */
export function computeFeeIncome_V2({ capital, poolTvl, dailyVolume, feeRate, days }) {
  if (poolTvl <= 0) return 0;
  const poolShare = capital / (poolTvl + capital);
  const dailyFees = dailyVolume * feeRate;
  return poolShare * dailyFees * days;
}

/**
 * Net yield for a V2 position: fees minus IL.
 * Returns { feeIncome, ilDollar, ilPct, netPnl, netPct, feeApr }
 */
export function computeNetYield_V2({ capital, poolTvl, dailyVolume, feeRate, days, priceChangeRatio }) {
  const feeIncome = computeFeeIncome_V2({ capital, poolTvl, dailyVolume, feeRate, days });
  const ilPct = computeIL_V2(priceChangeRatio);
  const ilDollar = ilPct * capital;
  const netPnl = feeIncome + ilDollar;
  const netPct = capital > 0 ? netPnl / capital : 0;
  const feeApr = capital > 0 && days > 0 ? (feeIncome / capital) * (365 / days) * 100 : 0;
  return { feeIncome, ilDollar, ilPct, netPnl, netPct, feeApr };
}

// ─── V3 (Concentrated Liquidity) ────────────────────────────────────────────

/**
 * Capital efficiency multiplier: how much more capital-efficient a V3 range
 * is vs a full-range V2 position.
 */
export function computeCapitalEfficiency(currentPrice, rangeLower, rangeUpper) {
  if (rangeLower >= rangeUpper || currentPrice <= 0) return 1;
  if (currentPrice <= rangeLower || currentPrice >= rangeUpper) return 1;
  const sqrtP = Math.sqrt(currentPrice);
  const sqrtPl = Math.sqrt(rangeLower);
  const sqrtPu = Math.sqrt(rangeUpper);
  return sqrtP / (sqrtPu - sqrtPl);
}

/**
 * Impermanent loss for a V3 concentrated liquidity position.
 * When price stays in range, IL is amplified by concentration.
 * When price exits range, position is 100% converted to one asset.
 */
export function computeIL_V3(priceChangeRatio, rangeLower, rangeUpper, currentPrice) {
  if (priceChangeRatio <= 0) return -1;
  const newPrice = currentPrice * priceChangeRatio;

  // If price exits range, full conversion to one side
  if (newPrice <= rangeLower) {
    const sqrtP0 = Math.sqrt(currentPrice);
    const sqrtPl = Math.sqrt(rangeLower);
    const holdValue = (1 + priceChangeRatio) / 2; // normalized HODL
    const lpValue = Math.sqrt(priceChangeRatio) * (sqrtPl) / sqrtP0;
    const il = lpValue > 0 && holdValue > 0 ? lpValue / holdValue - 1 : -1;
    return Math.max(il, -1);
  }

  if (newPrice >= rangeUpper) {
    const sqrtPu = Math.sqrt(rangeUpper);
    const sqrtP0 = Math.sqrt(currentPrice);
    const holdValue = (1 + priceChangeRatio) / 2;
    const lpValue = sqrtPu / sqrtP0;
    const il = holdValue > 0 ? lpValue / holdValue - 1 : -1;
    return Math.max(il, -1);
  }

  // Price still in range — amplified IL
  const v2IL = computeIL_V2(priceChangeRatio);
  const efficiency = computeCapitalEfficiency(currentPrice, rangeLower, rangeUpper);
  return Math.max(v2IL * Math.min(efficiency, 50), -1);
}

/**
 * Fee income for V3: amplified by capital efficiency multiplier.
 */
export function computeFeeIncome_V3({ capital, poolTvl, dailyVolume, feeRate, days, currentPrice, rangeLower, rangeUpper }) {
  const efficiency = computeCapitalEfficiency(currentPrice, rangeLower, rangeUpper);
  const effectiveCapital = capital * efficiency;
  const effectiveTvl = poolTvl + effectiveCapital;
  if (effectiveTvl <= 0) return 0;
  const poolShare = effectiveCapital / effectiveTvl;
  const dailyFees = dailyVolume * feeRate;
  return poolShare * dailyFees * days;
}

/**
 * Net yield for a V3 position.
 */
export function computeNetYield_V3({ capital, poolTvl, dailyVolume, feeRate, days, priceChangeRatio, currentPrice, rangeLower, rangeUpper }) {
  const feeIncome = computeFeeIncome_V3({ capital, poolTvl, dailyVolume, feeRate, days, currentPrice, rangeLower, rangeUpper });
  const ilPct = computeIL_V3(priceChangeRatio, rangeLower, rangeUpper, currentPrice);
  const ilDollar = ilPct * capital;
  const netPnl = feeIncome + ilDollar;
  const netPct = capital > 0 ? netPnl / capital : 0;
  const feeApr = capital > 0 && days > 0 ? (feeIncome / capital) * (365 / days) * 100 : 0;
  return { feeIncome, ilDollar, ilPct, netPnl, netPct, feeApr };
}

// ─── Shared ─────────────────────────────────────────────────────────────────

const IL_PRICE_CHANGES = [-50, -30, -20, -10, -5, 0, 5, 10, 20, 30, 50, 100];

/**
 * Scenario table: IL, fee income, and net P&L at various price changes.
 */
export function computeILTable(mode, params) {
  const { capital, poolTvl, dailyVolume, feeRate, days, currentPrice, rangeLower, rangeUpper } = params;

  return IL_PRICE_CHANGES.map(changePct => {
    const priceChangeRatio = 1 + changePct / 100;

    let ilPct, feeIncome;
    if (mode === "v3") {
      ilPct = computeIL_V3(priceChangeRatio, rangeLower, rangeUpper, currentPrice);
      feeIncome = computeFeeIncome_V3({ capital, poolTvl, dailyVolume, feeRate, days, currentPrice, rangeLower, rangeUpper });
    } else {
      ilPct = computeIL_V2(priceChangeRatio);
      feeIncome = computeFeeIncome_V2({ capital, poolTvl, dailyVolume, feeRate, days });
    }

    const ilDollar = ilPct * capital;
    const netPnl = feeIncome + ilDollar;
    const netPct = capital > 0 ? netPnl / capital * 100 : 0;

    return {
      changePct,
      priceChangeRatio,
      ilPct: ilPct * 100,
      ilDollar,
      feeIncome,
      netPnl,
      netPct,
    };
  });
}

// ─── Risk Rating (Moody's scale, same pattern as dnComputations) ────────────

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

/**
 * 6-factor risk rating for LP positions.
 */
export function computeLPRating({ mode, tokenA, tokenB, poolTvl, dailyVolume, feeRate, priceChangeRatio, currentPrice, rangeLower, rangeUpper }) {
  // Factor 1: Pair quality
  const aIsStable = STABLECOIN_LIST.some(s => tokenA.toUpperCase().includes(s.toUpperCase()));
  const bIsStable = STABLECOIN_LIST.some(s => tokenB.toUpperCase().includes(s.toUpperCase()));
  const aIsMajor = MAJOR_LIST.some(s => tokenA.toUpperCase().includes(s.toUpperCase()));
  const bIsMajor = MAJOR_LIST.some(s => tokenB.toUpperCase().includes(s.toUpperCase()));
  const bothStable = aIsStable && bIsStable;
  const hasMajor = aIsMajor || bIsMajor;

  const pairScore = bothStable ? 1 : (aIsStable || bIsStable) && hasMajor ? 1 : hasMajor ? 2 : 3;
  const pairDesc = bothStable ? "Stable-stable pair — minimal divergence risk."
    : hasMajor && (aIsStable || bIsStable) ? "Major/stable pair — moderate divergence potential."
    : hasMajor ? "Major asset pair — correlated but volatile."
    : "Exotic pair — high divergence and correlation risk.";

  // Factor 2: IL exposure
  const ilMag = Math.abs(computeIL_V2(priceChangeRatio)) * 100;
  const ilScore = ilMag < 1 ? 1 : ilMag < 3 ? 2 : ilMag < 8 ? 3 : 4;
  const ilDesc = ilMag < 1 ? "Minimal IL at projected price change."
    : ilMag < 3 ? "Low IL — fees likely cover the divergence."
    : ilMag < 8 ? "Moderate IL — fees must be substantial to offset."
    : "High IL — significant capital risk from price divergence.";

  // Factor 3: Volume consistency
  const volToTvl = poolTvl > 0 ? dailyVolume / poolTvl : 0;
  const volScore = volToTvl > 0.5 ? 1 : volToTvl > 0.2 ? 2 : volToTvl > 0.05 ? 3 : 4;
  const volDesc = volToTvl > 0.5 ? "High volume/TVL ratio — strong fee generation."
    : volToTvl > 0.2 ? "Good volume relative to TVL — decent fee capture."
    : volToTvl > 0.05 ? "Low volume relative to TVL — fee income may be thin."
    : "Very low trading activity — minimal fee income expected.";

  // Factor 4: TVL depth
  const tvlScore = poolTvl > 100_000_000 ? 1 : poolTvl > 10_000_000 ? 2 : poolTvl > 1_000_000 ? 3 : 4;
  const tvlDesc = poolTvl > 100_000_000 ? "Deep pool — low impact on entry/exit."
    : poolTvl > 10_000_000 ? "Decent depth — manageable slippage for most sizes."
    : poolTvl > 1_000_000 ? "Shallow pool — entry/exit slippage a concern for larger positions."
    : "Very shallow — significant slippage risk.";

  // Factor 5: Fee tier adequacy
  const feeAdequacy = poolTvl > 0 ? (dailyVolume * feeRate * 365) / poolTvl * 100 : 0;
  const feeScore = feeAdequacy > 20 ? 1 : feeAdequacy > 8 ? 2 : feeAdequacy > 3 ? 3 : 4;
  const feeDesc = feeAdequacy > 20 ? "Fee APR is high — strong compensation for LP risk."
    : feeAdequacy > 8 ? "Decent fee return — adequate for the risk in most scenarios."
    : feeAdequacy > 3 ? "Low fee return — marginal compensation for IL risk."
    : "Fee income too low to justify IL exposure.";

  // Factor 6: Smart contract / concentration risk
  const scScore = mode === "v3" ? 2 : 1;
  const scDesc = mode === "v3"
    ? "Concentrated liquidity — additional complexity. Range management and out-of-range risk."
    : "Standard V2 AMM — battle-tested, simpler mechanics. Lower smart contract complexity.";

  const factors = [
    { label: "Pair Quality",        score: pairScore, desc: pairDesc },
    { label: "IL Exposure",         score: ilScore,   desc: ilDesc },
    { label: "Volume Consistency",  score: volScore,  desc: volDesc },
    { label: "TVL Depth",           score: tvlScore,  desc: tvlDesc },
    { label: "Fee Tier Adequacy",   score: feeScore,  desc: feeDesc },
    { label: "Smart Contract Risk", score: scScore,   desc: scDesc },
  ];

  const avg = factors.reduce((s, f) => s + f.score, 0) / factors.length;
  const band = BANDS.find(b => avg <= b.max) || BANDS[BANDS.length - 1];

  return {
    factors: factors.map(f => ({ ...f, rating: SL[f.score], color: SC[f.score] })),
    overall: band.rating,
    overallColor: band.color,
    overallDesc: band.desc,
  };
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

export function exportLPCsv(ilTable, cfg) {
  const header = "Price Change %,IL %,IL $,Fee Income $,Net P&L $,Net %";
  const rows = ilTable.map(r =>
    `${r.changePct > 0 ? "+" : ""}${r.changePct}%,${r.ilPct.toFixed(2)}%,$${r.ilDollar.toFixed(2)},$${r.feeIncome.toFixed(2)},$${r.netPnl.toFixed(2)},${r.netPct.toFixed(2)}%`
  );

  const meta = [
    `# LP Yield Analysis`,
    `# Mode: ${cfg.mode === "v3" ? "V3 Concentrated" : "V2 Classic"}`,
    `# Pair: ${cfg.tokenA}/${cfg.tokenB}`,
    `# Capital: $${Number(cfg.capital).toLocaleString()}`,
    `# Pool TVL: $${Number(cfg.poolTvl).toLocaleString()}`,
    `# Daily Volume: $${Number(cfg.dailyVolume).toLocaleString()}`,
    `# Fee Rate: ${(cfg.feeRate * 100).toFixed(2)}%`,
    `# Time Horizon: ${cfg.days} days`,
    cfg.mode === "v3" ? `# Range: $${cfg.rangeLower} - $${cfg.rangeUpper}` : null,
    `# Generated: ${new Date().toISOString()}`,
    ``,
  ].filter(Boolean);

  const csv = [...meta, header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lp-yield-${cfg.tokenA}-${cfg.tokenB}-${cfg.mode}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Pool Scoring & Classification (Dashboard) ─────────────────────────────

/**
 * Classify a pool by its token pair composition.
 * Returns "stable", "major", or "exotic".
 * @param {string} symbol - Pool symbol (e.g. "USDC-WETH")
 * @param {Set<string>} [top100Set] - Optional live top-100 CMC symbols for "major" classification
 */
export function classifyPool(symbol, top100Set) {
  if (!symbol) return "exotic";
  const tokens = symbol.toUpperCase().split(/[-\/]/);

  const isStable = tok => STABLECOIN_LIST.some(s => tok.includes(s.toUpperCase()));
  const isMajor = tok => {
    if (MAJOR_LIST.some(s => tok.includes(s.toUpperCase()))) return true;
    if (top100Set && top100Set.size > 0) {
      return [...top100Set].some(s => tok.includes(s.toUpperCase()));
    }
    return false;
  };

  const allStable = tokens.every(t => isStable(t));
  if (allStable && tokens.length >= 2) return "stable";

  const hasMajor = tokens.some(t => isMajor(t) || isStable(t));
  if (hasMajor) return "major";

  return "exotic";
}

/**
 * Compute a risk-adjusted composite score for a pool.
 * Inputs come from DeFiLlama /pools data.
 * Returns { score (0-100), grade (A+ to C) }
 *
 * Weights:
 *   APY        30%  — higher is better, log-scaled to avoid outlier dominance
 *   TVL depth  20%  — deeper pools are safer
 *   Volume     20%  — more volume = more fee certainty
 *   IL risk    15%  — lower il7d = better
 *   Pair type  15%  — stable > major > exotic
 */
export function computePoolScore(pool) {
  // APY component (0-30): log-scaled, cap at 200% to dampen outliers
  const apy = Math.min(pool.apy || 0, 200);
  const apyScore = apy <= 0 ? 0 : (Math.log10(1 + apy) / Math.log10(201)) * 30;

  // TVL component (0-20): log-scaled from $100K to $500M
  const tvl = pool.tvlUsd || 0;
  const tvlScore = tvl <= 100_000 ? 0
    : Math.min((Math.log10(tvl) - 5) / (Math.log10(500_000_000) - 5) * 20, 20);

  // Volume component (0-20): based on volume/TVL ratio
  const vol = pool.volumeUsd1d || pool.volumeUsd7d / 7 || 0;
  const volRatio = tvl > 0 ? vol / tvl : 0;
  const volScore = Math.min(volRatio / 0.5 * 20, 20); // 50% vol/TVL = max score

  // IL risk component (0-15): lower il7d = higher score
  const il7d = Math.abs(pool.il7d || 0);
  const ilScore = il7d === 0 ? 12 // no data — assume moderate
    : il7d < 0.5 ? 15
    : il7d < 2 ? 12
    : il7d < 5 ? 8
    : il7d < 10 ? 4
    : 0;

  // Pair quality component (0-15)
  const poolType = classifyPool(pool.symbol);
  const pairScore = poolType === "stable" ? 15 : poolType === "major" ? 10 : 3;

  const totalScore = apyScore + tvlScore + volScore + ilScore + pairScore;

  // Map to letter grade
  const grade = totalScore >= 75 ? "A+"
    : totalScore >= 65 ? "A"
    : totalScore >= 55 ? "A-"
    : totalScore >= 45 ? "B+"
    : totalScore >= 35 ? "B"
    : totalScore >= 25 ? "B-"
    : totalScore >= 15 ? "C+"
    : "C";

  return { score: Math.round(totalScore * 10) / 10, grade };
}

/**
 * Grade color mapping.
 */
export function gradeColor(grade) {
  if (grade.startsWith("A")) return C.green;
  if (grade.startsWith("B")) return C.amber;
  return C.red;
}

/**
 * Rank and score an array of pools.
 * Returns the pools sorted by composite score descending.
 * @param {Object[]} pools - Raw pool objects from DeFiLlama
 * @param {Set<string>} [top100Set] - Optional live top-100 CMC symbols
 */
export function rankPools(pools, top100Set) {
  return pools
    .map(p => {
      const { score, grade } = computePoolScore(p);
      return { ...p, _score: score, _grade: grade, _type: classifyPool(p.symbol, top100Set) };
    })
    .sort((a, b) => b._score - a._score);
}

/**
 * Compute a suggested V3 range based on historical price volatility.
 * Uses poolDayDatas (array of { date, close, volumeUSD }) from subgraph.
 * Returns { rangeLower, rangeUpper, expectedEfficiency, confidence }
 */
export function computeSweetSpot(currentPrice, poolDayDatas) {
  if (!currentPrice || !poolDayDatas || poolDayDatas.length < 7) {
    // Not enough data — default to +/- 30% range
    return {
      rangeLower: currentPrice * 0.7,
      rangeUpper: currentPrice * 1.3,
      expectedEfficiency: 2.5,
      confidence: "low",
    };
  }

  // Calculate daily returns
  const closes = poolDayDatas
    .map(d => parseFloat(d.close || d.token0Price || 0))
    .filter(c => c > 0);

  if (closes.length < 7) {
    return {
      rangeLower: currentPrice * 0.7,
      rangeUpper: currentPrice * 1.3,
      expectedEfficiency: 2.5,
      confidence: "low",
    };
  }

  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  // Annualized volatility
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const dailyVol = Math.sqrt(variance);
  const annualVol = dailyVol * Math.sqrt(365);

  // Set range to ~1.5 standard deviations over 30 days
  const thirtyDayVol = dailyVol * Math.sqrt(30);
  const rangeMultiple = 1.5;
  const rangePct = thirtyDayVol * rangeMultiple;

  const rangeLower = currentPrice * Math.exp(-rangePct);
  const rangeUpper = currentPrice * Math.exp(rangePct);

  const efficiency = computeCapitalEfficiency(currentPrice, rangeLower, rangeUpper);

  const confidence = closes.length >= 30 ? "high"
    : closes.length >= 14 ? "medium"
    : "low";

  return {
    rangeLower: Math.round(rangeLower * 100) / 100,
    rangeUpper: Math.round(rangeUpper * 100) / 100,
    expectedEfficiency: Math.round(efficiency * 10) / 10,
    confidence,
    annualVol: Math.round(annualVol * 10000) / 100, // as percentage
    dataPoints: closes.length,
  };
}
