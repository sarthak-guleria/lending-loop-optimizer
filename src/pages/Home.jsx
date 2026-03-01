import { Link } from "react-router-dom";
import { C } from "../constants.js";

const TOOLS = [
  {
    to: "/loop",
    label: "Loop Optimizer",
    tag: "LIVE",
    tagColor: C.green,
    desc: "Model yield looping strategies on Aave. Stress-test liquidation thresholds and find optimal loop depth.",
    detail: "Supports E-Mode, configurable LTV, CSV export, shareable URLs.",
  },
  {
    to: "/delta-neutral",
    label: "Delta Neutral",
    tag: "COMING SOON",
    tagColor: C.amber,
    desc: "Explore basis trading and funding rate capture on perp DEXes. Live rates from Hyperliquid, Drift, dYdX, and GMX.",
    detail: "Net carry calculator · Liquidation stress test · Multi-venue comparison.",
    disabled: true,
  },
];

export default function Home() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 20px 100px" }}>

      <div style={{ marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent, boxShadow: "0 0 8px " + C.accent }} />
          <span style={{ fontSize: 10, color: C.accent, letterSpacing: "0.2em", textTransform: "uppercase" }}>DeFi Strategy Tools</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}>Fren Labs</h1>
        <p style={{ color: C.dim, fontSize: 13, margin: "8px 0 0", lineHeight: 1.7 }}>
          Tools for thinking through DeFi strategies. Model the numbers, stress-test the risks, understand what you're actually doing.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {TOOLS.map(({ to, label, tag, tagColor, desc, detail, disabled }) => {
          const card = (
            <div style={{
              background: C.panel,
              border: "1px solid " + (disabled ? C.border : C.border),
              borderRadius: 10,
              padding: "20px 24px",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled ? 0.65 : 1,
              transition: "border-color 0.15s",
            }}
              onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = C.accent + "55"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{label}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: tagColor, background: tagColor + "22", border: "1px solid " + tagColor + "44",
                  padding: "2px 7px", borderRadius: 4,
                }}>{tag}</span>
              </div>
              <p style={{ fontSize: 13, color: C.dim, margin: "0 0 8px", lineHeight: 1.65 }}>{desc}</p>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{detail}</p>
              {!disabled && (
                <div style={{ marginTop: 14, fontSize: 11, color: C.accent, fontWeight: 700 }}>
                  Open tool →
                </div>
              )}
            </div>
          );

          return disabled ? (
            <div key={to}>{card}</div>
          ) : (
            <Link key={to} to={to} style={{ textDecoration: "none" }}>{card}</Link>
          );
        })}
      </div>

      <div style={{ marginTop: 56, fontSize: 10, color: C.muted, lineHeight: 1.8 }}>
        ⚠ For educational purposes only. Not financial advice. DeFi carries significant risk.
      </div>
    </div>
  );
}
