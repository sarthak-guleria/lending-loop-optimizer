# Fren Labs

A growing collection of browser-based tools for thinking through DeFi strategies. Model the numbers, stress-test the risks, understand what you're actually doing before you touch a protocol.

Built by [Fren](https://x.com/Fren_pm) · [fren-labs.vercel.app](https://fren-labs.vercel.app)

---

## Tools

### Loop Optimizer `/loop`

Model yield looping strategies on Aave V3. Stress-test liquidation thresholds and find the optimal loop depth for your capital.

- Configurable strategy — chain, collateral asset, borrow asset, exit asset
- Loop depth simulator — computes net APY across 0–10 loops
- Interactive loop selector — pin any depth to see exact dollar breakdown
- Per-loop borrow guide — step-by-step supply/borrow amounts
- Dynamic risk rating — Moody's-scale equivalent, updates live
- Collateral stress test — health factor at various price drops
- CSV export + shareable URLs

### Delta Neutral Explorer `/delta-neutral`

Basis trading and funding rate capture on Hyperliquid. Live rates across 10 markets with ranked position recommendations.

- Live funding rates from Hyperliquid API — auto-refreshes every 5 minutes
- Ranked position recommendations — ENTER / CONSIDER / EXIT based on rate + risk
- Carry breakdown — hourly, daily, monthly, annual net yield
- 7-day funding rate history chart per market
- Leveraged mode — models gross funding vs borrow cost
- Spot liquidation stress test for leveraged positions
- Shareable URLs

---

## Stack

- [React 18](https://react.dev/) + [Vite 6](https://vitejs.dev/)
- [Recharts](https://recharts.org/) for charting
- [React Router v6](https://reactrouter.com/) for routing
- IBM Plex Mono — Bloomberg terminal aesthetic

## Running locally

```bash
npm install
npm run dev
```

## Disclaimer

For educational purposes only. Not financial advice. DeFi carries significant risk including liquidation, smart contract vulnerabilities, and funding rate reversals. Do your own research.

## License

MIT
