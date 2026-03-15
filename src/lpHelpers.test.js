import { describe, it, expect } from "vitest";
import { parseFeeFromGeckoName, parseSymbolFromGeckoName, feeTierFromPool } from "./lpHelpers.js";

// ─── parseFeeFromGeckoName ────────────────────────────────────────────────────

describe("parseFeeFromGeckoName", () => {
  it("parses 0.01% tier", () => {
    expect(parseFeeFromGeckoName("WBTC / USDC 0.01%")).toBeCloseTo(0.0001);
  });
  it("parses 0.05% tier", () => {
    expect(parseFeeFromGeckoName("WETH / USDT 0.05%")).toBeCloseTo(0.0005);
  });
  it("parses 0.3% tier", () => {
    expect(parseFeeFromGeckoName("WETH / UNI 0.3%")).toBeCloseTo(0.003);
  });
  it("parses 1% tier", () => {
    expect(parseFeeFromGeckoName("SHIB / WETH 1%")).toBeCloseTo(0.01);
  });
  it("defaults to 0.3% for missing fee", () => {
    expect(parseFeeFromGeckoName("WETH / USDC")).toBeCloseTo(0.003);
  });
  it("defaults to 0.3% for null input", () => {
    expect(parseFeeFromGeckoName(null)).toBeCloseTo(0.003);
  });
});

// ─── parseSymbolFromGeckoName ─────────────────────────────────────────────────

describe("parseSymbolFromGeckoName", () => {
  it("strips fee and formats as TOKEN0-TOKEN1", () => {
    expect(parseSymbolFromGeckoName("WETH / USDT 0.05%")).toBe("WETH-USDT");
  });
  it("handles 0.3% tier", () => {
    expect(parseSymbolFromGeckoName("USDC / WETH 0.3%")).toBe("USDC-WETH");
  });
  it("handles 1% tier", () => {
    expect(parseSymbolFromGeckoName("PEPE / WETH 1%")).toBe("PEPE-WETH");
  });
  it("handles name without fee gracefully", () => {
    expect(parseSymbolFromGeckoName("WETH / DAI")).toBe("WETH-DAI");
  });
  it("returns empty string for null input", () => {
    expect(parseSymbolFromGeckoName(null)).toBe("");
  });
});

// ─── feeTierFromPool ──────────────────────────────────────────────────────────

describe("feeTierFromPool", () => {
  it("uses exact feeTier field when present (500 → 0.05%)", () => {
    expect(feeTierFromPool({ feeTier: 500 })).toBeCloseTo(0.0005);
  });
  it("uses exact feeTier field when present (3000 → 0.3%)", () => {
    expect(feeTierFromPool({ feeTier: 3000 })).toBeCloseTo(0.003);
  });
  it("uses exact feeTier field when present (10000 → 1%)", () => {
    expect(feeTierFromPool({ feeTier: 10000 })).toBeCloseTo(0.01);
  });
  it("falls back to symbol parsing for 0.05%", () => {
    expect(feeTierFromPool({ symbol: "WETH-USDC-0.05" })).toBeCloseTo(0.0005);
  });
  it("falls back to default 0.3% when no data", () => {
    expect(feeTierFromPool({ symbol: "WETH-DAI" })).toBeCloseTo(0.003);
  });
  it("APY-based estimate returns sensible tier", () => {
    // High APY/volume ratio → 0.3% tier
    const pool = { apyBase: 30, tvlUsd: 1_000_000, volumeUsd1d: 3_000_000 };
    expect(feeTierFromPool(pool)).toBeCloseTo(0.003);
  });
});
