import { C } from "./constants.js";

export function computeLoops(cfg) {
  const { capital, collateralSupplyApy, borrowApy, exitSupplyApy, maxLtv, safetyBuffer } = cfg;
  const safeLtv = Math.max(0, maxLtv - safetyBuffer) / 100;
  return Array.from({ length: 11 }, (_, loops) => {
    let totalSupplied, totalBorrowed;
    if (safeLtv >= 1) {
      totalSupplied = capital * (loops + 1);
      totalBorrowed = capital * loops;
    } else {
      totalSupplied = capital * (1 - Math.pow(safeLtv, loops + 1)) / (1 - safeLtv);
      totalBorrowed = totalSupplied - capital;
    }
    const lastBorrow = loops > 0 ? capital * Math.pow(safeLtv, loops) : 0;
    const supplyIncome = (totalSupplied - lastBorrow) * (collateralSupplyApy / 100) + lastBorrow * (exitSupplyApy / 100);
    const borrowCost = totalBorrowed * (borrowApy / 100);
    const netApy = ((supplyIncome - borrowCost) / capital) * 100;
    return {
      loops,
      netApy: +netApy.toFixed(3),
      totalSupplied: +totalSupplied.toFixed(2),
      totalBorrowed: +totalBorrowed.toFixed(2),
      safeLtvUsed: +(safeLtv * 100).toFixed(1),
      lastBorrow: +lastBorrow.toFixed(2),
    };
  });
}

export function computeRating(cfg) {
  const spread = cfg.collateralSupplyApy - cfg.borrowApy;
  const safeLtv = cfg.maxLtv - cfg.safetyBuffer;
  const isStable = n =>
    ["usd", "dai", "gho", "usdc", "usdt", "usde", "susde", "eurc", "frax", "lusd"].some(s =>
      n.toLowerCase().includes(s)
    );
  const factors = [
    {
      label: "Collateral Quality",
      score: isStable(cfg.collateralAsset) ? 2 : 3,
      desc: isStable(cfg.collateralAsset)
        ? `${cfg.collateralAsset} — yield-bearing stablecoin; depeg risk during stress`
        : `${cfg.collateralAsset} — non-stable, subject to price swings`,
    },
    {
      label: "Yield Source Stability",
      score: cfg.exitSupplyApy > 12 ? 4 : cfg.exitSupplyApy > 8 ? 3 : cfg.exitSupplyApy > 5 ? 2 : 1,
      desc:
        cfg.exitSupplyApy > 8
          ? `${cfg.exitAsset} at ${cfg.exitSupplyApy}% — incentive-driven, variable`
          : `${cfg.exitAsset} at ${cfg.exitSupplyApy}% — moderate, partially incentive-driven`,
    },
    {
      label: "Borrow Spread",
      score: spread > 3 ? 1 : spread > 1.5 ? 2 : spread > 0.5 ? 3 : 4,
      desc: `${cfg.collateralSupplyApy}% supply − ${cfg.borrowApy}% borrow = ${spread.toFixed(2)}% net spread per loop`,
    },
    {
      label: "Liquidation Risk",
      score: safeLtv > 85 ? 4 : safeLtv > 75 ? 3 : safeLtv > 65 ? 2 : 1,
      desc: `Safe LTV ${safeLtv}% — ${safeLtv > 80 ? "thin margin, cascade risk at high loop count" : "adequate buffer"}`,
    },
    {
      label: "Smart Contract Risk",
      score: cfg.loopChain === cfg.exitChain ? 2 : 3,
      desc:
        cfg.loopChain === cfg.exitChain
          ? `Single chain (${cfg.loopChain}) — no bridge exposure`
          : `Cross-chain (${cfg.loopChain} → ${cfg.exitChain}) — bridge risk`,
    },
    {
      label: "Unwind Ease",
      score: cfg.loopChain === cfg.exitChain ? 2 : 3,
      desc:
        cfg.loopChain === cfg.exitChain
          ? "Same chain — repay loops in sequence"
          : `Must bridge back ${cfg.exitChain} → ${cfg.loopChain} to unwind`,
    },
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
  return {
    factors: factors.map(f => ({ ...f, rating: SL[f.score], color: SC[f.score] })),
    overall: band.rating,
    overallColor: band.color,
    overallDesc: band.desc,
  };
}

export function exportCsv(loopData, cfg) {
  const headers = ["Loops", "Safe LTV %", "Total Supplied $", "Total Borrowed $", "Exit Amount $", "Net APY %", "vs Benchmark %"];
  const rows = loopData.map(d => [
    d.loops,
    d.safeLtvUsed,
    d.totalSupplied,
    d.totalBorrowed,
    d.lastBorrow,
    d.netApy,
    (d.netApy - cfg.benchmarkApy).toFixed(3),
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cfg.strategyName.replace(/\s+/g, "-")}-loops.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
