import { useState, useCallback } from "react";

function configToSearch(cfg) {
  return "?" + new URLSearchParams(
    Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, String(v)]))
  ).toString();
}

function searchToConfig(defaults) {
  const params = new URLSearchParams(window.location.search);
  const cfg = { ...defaults };
  Object.keys(defaults).forEach(k => {
    if (params.has(k)) {
      const v = params.get(k);
      cfg[k] = typeof defaults[k] === "number" ? Number(v) : v;
    }
  });
  return cfg;
}

export function useUrlState(defaults) {
  const [cfg, setCfgRaw] = useState(() => searchToConfig(defaults));

  const setCfg = useCallback((updater) => {
    setCfgRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      window.history.replaceState(null, "", configToSearch(next));
      return next;
    });
  }, []);

  return [cfg, setCfg];
}
