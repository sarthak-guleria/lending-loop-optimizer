// Pure helpers extracted for testability

export const parseFeeFromGeckoName = (name) => {
  const m = (name || "").match(/(\d+\.?\d*)%/);
  return m ? parseFloat(m[1]) / 100 : 0.003;
};

export const parseSymbolFromGeckoName = (name) => {
  const clean = (name || "").replace(/\d+\.?\d*%/, "").replace(/\s+/g, " ").trim();
  return clean.split("/").map(s => s.trim()).filter(Boolean).join("-");
};

export const feeTierFromPool = (pool) => {
  if (pool.feeTier) return pool.feeTier / 1_000_000;
  const sym = (pool.symbol || "").toLowerCase();
  if (sym.includes("0.01")) return 0.0001;
  if (sym.includes("0.05")) return 0.0005;
  if (sym.includes("1%") || sym.includes("1.00")) return 0.01;
  if (pool.apyBase && pool.tvlUsd && pool.volumeUsd1d) {
    const est = (pool.apyBase / 100 * pool.tvlUsd / 365) / (pool.volumeUsd1d || 1);
    if (est < 0.00025) return 0.0001;
    if (est < 0.002)   return 0.0005;
    if (est < 0.006)   return 0.003;
    return 0.01;
  }
  return 0.003;
};
