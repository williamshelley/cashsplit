import { describe, it, expect } from "vitest";
import { venmoPayLink, normalizeHandle } from "../src/venmo";

describe("normalizeHandle", () => {
  it("strips a leading @", () => {
    expect(normalizeHandle("@alice")).toBe("alice");
  });
  it("trims whitespace", () => {
    expect(normalizeHandle("  bob  ")).toBe("bob");
  });
  it("returns null for empty input", () => {
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle("   ")).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
  });
});

describe("venmoPayLink", () => {
  it("builds a pay link with handle, amount and note", () => {
    const url = new URL(venmoPayLink({ handle: "alice", amount: 12.5, note: "CashSplit: Trip" }));
    expect(url.origin + url.pathname).toBe("https://venmo.com/alice");
    expect(url.searchParams.get("txn")).toBe("pay");
    expect(url.searchParams.get("amount")).toBe("12.50");
    expect(url.searchParams.get("note")).toBe("CashSplit: Trip");
  });

  it("formats amount to two decimals", () => {
    const url = new URL(venmoPayLink({ handle: "bob", amount: 7, note: "x" }));
    expect(url.searchParams.get("amount")).toBe("7.00");
  });

  it("url-encodes handle and note", () => {
    const link = venmoPayLink({ handle: "@alice", amount: 1, note: "Dinner & drinks" });
    expect(link).toContain("/alice"); // leading @ stripped
    expect(link).toContain("Dinner%20%26%20drinks");
  });

  it("throws when handle is missing", () => {
    expect(() => venmoPayLink({ handle: null, amount: 1, note: "x" })).toThrow();
  });
});
