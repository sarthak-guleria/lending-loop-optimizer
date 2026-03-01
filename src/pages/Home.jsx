import { Link } from "react-router-dom";
import { C } from "../constants.js";

const TOOLS = [
  {
    to:     "/loop",
    fkey:   "F2",
    label:  "LENDING LOOP OPTIMIZER",
    status: "LIVE",
    color:  C.green,
    desc:   "Model yield looping strategies on Aave V3. Stress-test liquidation thresholds and find the optimal loop depth for your capital.",
    detail: "E-Mode · Configurable LTV · CSV Export · Shareable URLs · Per-loop borrow guide",
    meta:   [
      { k: "STRATEGY", v: "sUSDe → GHO" },
      { k: "PLATFORM",  v: "Aave V3" },
      { k: "CHAIN",     v: "Ethereum" },
    ],
  },
  {
    to:     "/delta-neutral",
    fkey:   "F3",
    label:  "DELTA NEUTRAL EXPLORER",
    status: "LIVE",
    color:  C.green,
    desc:   "Basis trading and funding rate capture on Hyperliquid. Live rates across 10 markets with ranked position recommendations.",
    detail: "Net carry · Position recommendations · Liquidation stress · Shareable URLs",
    meta:   [
      { k: "PLATFORM", v: "Hyperliquid" },
      { k: "MARKETS",  v: "10 Assets" },
      { k: "REFRESH",  v: "5 min" },
    ],
  },
  {
    to:      "https://paycabal.xyz",
    fkey:    "↗",
    label:   "PAYCABAL",
    status:  "LIVE",
    color:   C.accent,
    external: true,
    desc:    "Curated registry for discovering and comparing crypto payment solutions. Cards, neo-banks, on/off ramps, payroll, and infrastructure — side-by-side.",
    detail:  "Human-verified · 8+ providers · Side-by-side comparison · No account required",
    meta:    [
      { k: "TYPE",     v: "Registry" },
      { k: "CATEGORY", v: "Payments" },
      { k: "DATA",     v: "Verified" },
    ],
  },
];

export default function Home() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 60px" }}>

      {/* Breadcrumb */}
      <div style={{
        fontSize: 10, color: C.dim, marginBottom: 20,
        letterSpacing: "0.1em", borderBottom: "1px solid " + C.border, paddingBottom: 10,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: C.accent, fontWeight: 700 }}>FREN LABS</span>
        <span>›</span>
        <span>TOOL DIRECTORY</span>
      </div>

      {/* Section header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          background: C.accent, color: "#000",
          padding: "4px 12px", fontSize: 10, fontWeight: 900,
          textTransform: "uppercase", letterSpacing: "0.15em",
          display: "inline-block", marginBottom: 12,
        }}>
          DeFi STRATEGY TOOLS
        </div>
        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.7 }}>
          Model the numbers, stress-test the risks, understand what you're actually doing.
          Press function key or click tool below.
        </div>
      </div>

      {/* Tool list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {TOOLS.map(({ to, fkey, label, status, color, desc, detail, meta, external }) => {
          const card = (
            <div
              style={{ background: C.panel, border: "1px solid " + C.border, cursor: "pointer", transition: "border-color 0.1s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = "#111"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.panel; }}
            >
              {/* Card header bar */}
              <div style={{
                background: "#151515", borderBottom: "1px solid " + C.border,
                padding: "5px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 900, background: "#252525",
                    color: C.dim, padding: "1px 6px", letterSpacing: "0.06em",
                  }}>{fkey}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.text, letterSpacing: "0.06em" }}>{label}</span>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 900, color: "#000",
                  background: color, padding: "1px 8px", letterSpacing: "0.12em",
                }}>{status}</span>
              </div>

              {/* Card body */}
              <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <p style={{ fontSize: 12, color: C.text, margin: "0 0 6px", lineHeight: 1.65 }}>{desc}</p>
                    <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{detail}</p>
                  </div>
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexShrink: 0 }}>
                    {meta.map(m => (
                      <div key={m.k}>
                        <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{m.k}</div>
                        <div style={{ fontSize: 11, color: color, fontWeight: 700, fontFamily: "monospace" }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{
                  borderTop: "1px solid " + C.border, paddingTop: 8, marginTop: 10,
                  fontSize: 10, color: color, fontWeight: 700, letterSpacing: "0.08em",
                }}>
                  {external ? "VISIT SITE ↗" : "OPEN TOOL →"}
                </div>
              </div>
            </div>
          );

          return external ? (
            <a key={to} href={to} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{card}</a>
          ) : (
            <Link key={to} to={to} style={{ textDecoration: "none" }}>{card}</Link>
          );
        })}
      </div>

      {/* Footer disclaimer */}
      <div style={{ marginTop: 20, fontSize: 9, color: C.muted, lineHeight: 1.8, borderTop: "1px solid " + C.border, paddingTop: 12, letterSpacing: "0.06em" }}>
        ⚠ FOR EDUCATIONAL PURPOSES ONLY · NOT FINANCIAL ADVICE · DEFI CARRIES SIGNIFICANT RISK
      </div>
    </div>
  );
}
