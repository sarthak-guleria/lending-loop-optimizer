import { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { C } from "./constants.js";

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return time;
}

function useIsMobile(breakpoint = 640) {
  const [mobile, setMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return mobile;
}

const FKEYS = [
  { key: "F1", label: "HOME",    to: "/" },
  { key: "F2", label: "LOOP",    to: "/loop" },
  { key: "F3", label: "DELTA-N", to: "/delta-neutral" },
];

export default function Shell() {
  const time    = useClock();
  const loc     = useLocation();
  const mobile  = useIsMobile(640);

  const timeStr = time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = time.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: C.bg, minHeight: "100vh", color: C.text, paddingBottom: 28 }}>

      {/* ── Top nav bar ───────────────────────────────────────────── */}
      <nav style={{
        borderBottom: "2px solid " + C.accent,
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 34,
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "#000",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: mobile ? 10 : 16 }}>
          <NavLink to="/" style={{ textDecoration: "none" }}>
            <span style={{
              fontSize: 12, fontWeight: 900, color: "#000",
              background: C.accent, padding: "2px 10px",
              letterSpacing: "0.1em",
            }}>
              FREN LABS
            </span>
          </NavLink>
          {!mobile && (
            <>
              <span style={{ fontSize: 10, color: C.dim, letterSpacing: "0.08em" }}>DEFI STRATEGY TERMINAL</span>
              <span style={{ fontSize: 10, color: C.border }}>|</span>
              {FKEYS.slice(1).map(({ key, label, to }) => {
                const isActive = loc.pathname.startsWith(to);
                return (
                  <NavLink key={to} to={to} style={{ textDecoration: "none" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                      color: isActive ? C.accent : C.dim,
                      borderBottom: isActive ? "1px solid " + C.accent : "1px solid transparent",
                      paddingBottom: 1,
                    }}>{label}</span>
                  </NavLink>
                );
              })}
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: mobile ? 8 : 12, fontSize: 10 }}>
          <span style={{ color: C.green, fontWeight: 700 }}>● LIVE</span>
          {!mobile && <span style={{ color: C.border }}>|</span>}
          <span style={{ color: C.text, fontWeight: 700, fontFamily: "monospace" }}>{timeStr}</span>
          {!mobile && <span style={{ color: C.dim }}>{dateStr}</span>}
        </div>
      </nav>

      <Outlet />

      {/* ── Bottom function key bar ────────────────────────────────── */}
      <div style={{
        position: "fixed",
        bottom: 0, left: 0, right: 0,
        height: 28,
        background: "#0a0a0a",
        borderTop: "1px solid " + C.border,
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        gap: 1,
        zIndex: 200,
      }}>
        {FKEYS.map(({ key, label, to }) => {
          const isActive = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <NavLink key={to} to={to} style={{ textDecoration: "none", marginRight: 4 }}>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <span style={{
                  fontSize: 10, fontWeight: 900, fontFamily: "monospace",
                  background: isActive ? C.accent : "#2a2a2a",
                  color: isActive ? "#000" : C.dim,
                  padding: "2px 5px",
                }}>{key}</span>
                <span style={{
                  fontSize: 10, fontFamily: "monospace",
                  background: isActive ? "#181818" : "#111",
                  color: isActive ? C.text : "#555",
                  padding: "2px 8px",
                }}>{label}</span>
              </span>
            </NavLink>
          );
        })}
        <div style={{ flex: 1 }} />
        {!mobile && (
          <span style={{ fontSize: 9, color: C.muted, letterSpacing: "0.06em" }}>FREN LABS v1.0 · EDUCATIONAL USE ONLY · NOT FINANCIAL ADVICE</span>
        )}
      </div>
      <SpeedInsights />
    </div>
  );
}
