# Lending Loop Optimizer

A browser-based simulator for DeFi lending loop strategies. Model any collateral→borrow→exit loop, tune APYs and LTV parameters, and see how yield scales with loop depth — all before you touch a protocol.

![Lending Loop Optimizer](https://img.shields.io/badge/built_with-React_%2B_Vite-61dafb?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## What it does

- **Configurable strategy** — set your chain, collateral asset, borrow asset, and exit asset via text inputs
- **Loop depth simulator** — computes net APY across 0–10 loops using geometric series math
- **Interactive loop selector** — pin any loop depth to see exact dollar breakdown (supply income, borrow cost, net)
- **Per-loop borrow guide** — step-by-step supply/borrow amounts for executing the strategy
- **Dynamic risk rating** — Moody's-scale equivalent rating that updates live as you change parameters
- **Collateral stress test** — enter your real Aave position and see health factor at various price drops (-1% to -30%)

## Default strategy

`sUSDe Loop → GHO Exit` on Mantle — supply sUSDe, borrow USDC in E-Mode, re-supply, exit final loop into GHO supply. Fully configurable to any strategy.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
npm run preview
```

## Stack

- [React 18](https://react.dev/)
- [Vite 6](https://vitejs.dev/)
- [Recharts](https://recharts.org/)

## Disclaimer

This tool is for educational and research purposes only. It does not constitute financial advice. DeFi protocols carry significant risks including smart contract risk, liquidation risk, and loss of funds. Always do your own research.

## License

MIT
