export const C = {
  bg:     "#000000",   // pure black terminal
  panel:  "#0d0d0d",   // panel background
  border: "#222222",   // border
  accent: "#CC6600",   // muted copper-orange
  green:  "#00A855",   // softer forest green
  amber:  "#C8A000",   // warm gold
  red:    "#CC2233",   // deep red
  muted:  "#444444",   // muted
  text:   "#E0E0E0",   // near-white body text
  dim:    "#777777",   // dimmed labels
};

export const DEFAULT_CONFIG = {
  strategyName: "sUSDe Loop → GHO Exit",
  loopChain: "Ethereum",
  collateralAsset: "sUSDe",
  borrowAsset: "USDC",
  exitChain: "Ethereum",
  exitAsset: "GHO",
  collateralSupplyApy: 3.50,
  borrowApy: 2.50,
  exitSupplyApy: 7.03,
  maxLtv: 90,
  safetyBuffer: 10,
  capital: 10000,
  benchmarkApy: 7.03,
  benchmarkLabel: "GHO Direct Supply",
  stressCollateral: 24400,
  stressDebt: 14400,
  stressLiqThreshold: 92,
};
