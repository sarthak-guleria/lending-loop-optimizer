import { Outlet, NavLink } from "react-router-dom";
import { C } from "./constants.js";

export default function Shell() {
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: C.bg, minHeight: "100vh", color: C.text }}>
      <nav style={{
        borderBottom: "1px solid " + C.border,
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 48,
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: C.bg,
      }}>
        <NavLink to="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.accent, letterSpacing: "0.05em" }}>
            Fren Labs
          </span>
        </NavLink>

        <div style={{ display: "flex", gap: 4 }}>
          {[
            { to: "/loop", label: "Loop Optimizer" },
            { to: "/delta-neutral", label: "Delta Neutral" },
          ].map(({ to, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              textDecoration: "none",
              fontSize: 11,
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 6,
              color: isActive ? C.accent : C.dim,
              background: isActive ? C.accent + "18" : "transparent",
              border: "1px solid " + (isActive ? C.accent + "44" : "transparent"),
              transition: "all 0.15s",
            })}>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
