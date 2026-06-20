import { readFileSync } from "node:fs";

// Read the shipped artifacts directly (relative to the repo root, mirroring how
// tests/rules.test.ts reads "firestore.rules"). These tests encode the "Pocket"
// design contract: the warm/light token palette + Hanken Grotesk type, plus a
// guard that every CSS class the views emit still has a styling rule, so the
// theme swap cannot silently drop a screen's styling.
const css = readFileSync("src/styles.css", "utf8");
const html = readFileSync("index.html", "utf8");

/** True when the stylesheet declares the given CSS variable with the given value. */
function hasToken(name: string, value: string): boolean {
  return new RegExp(`--${name}\\s*:\\s*${value}\\s*;`, "i").test(css);
}

/** True when the stylesheet defines a rule using the given class selector. */
function hasSelector(cls: string): boolean {
  // Match ".cls" not immediately followed by another word/dash char, so ".badge"
  // doesn't spuriously match inside ".badge-you".
  return new RegExp(`\\.${cls}(?![\\w-])`).test(css);
}

describe("Pocket design tokens", () => {
  const tokens: Array<[string, string]> = [
    ["bg", "#fdf4ec"],
    ["panel", "#ffffff"],
    ["panel-2", "#fbeadd"],
    ["text", "#3a2e28"],
    ["muted", "#a08576"],
    ["faint", "#bfa595"],
    ["brand", "#f2683f"],
    ["brand-2", "#ffa726"],
    ["danger", "#e0552f"],
    ["border", "#f1ddcd"],
  ];
  it.each(tokens)("defines --%s: %s", (name, value) => {
    expect(hasToken(name, value)).toBe(true);
  });

  it("uses a pill radius token (999px)", () => {
    expect(/999px/.test(css)).toBe(true);
  });

  it("constrains the app column to Pocket's 600px width", () => {
    expect(/#app\s*\{[^}]*max-width:\s*600px/.test(css)).toBe(true);
  });

  it("gives h2 a bold display size (auth titles render at the Pocket scale)", () => {
    // The auth screens use <h2> ("Welcome back" / "Create your account"); without
    // an explicit rule they fall back to the browser default instead of the
    // Pocket display scale. Require a dedicated h2 rule with a font-size.
    expect(/(^|[\s,}])h2\s*\{[^}]*font-size/.test(css)).toBe(true);
  });
});

describe("class coverage — no screen loses its styling in the swap", () => {
  // Every base class the src/ui/*.ts views emit (derived from `grep "class:" src/ui`).
  const required = [
    "topbar", "brand",
    "card", "empty",
    "btn", "primary", "venmo", "danger", "small", "active",
    "row", "wrap", "spacer", "muted", "hint", "error", "ok", "center", "stack",
    "tabs", "list-item",
    "badge", "badge-you", "badge-linked", "badge-unlinked",
    "balances", "owed", "owes",
    "settle-row", "settle-amt", "settle-actions",
    "preview", "pv-row", "pv-total",
    "checks", "banner",
    "modal-overlay", "modal",
  ];
  it.each(required)("styles .%s", (cls) => {
    expect(hasSelector(cls)).toBe(true);
  });
});

describe("font + browser chrome contracts", () => {
  it("loads Hanken Grotesk via a <link> in index.html (not a CSS @import)", () => {
    expect(/<link[^>]+Hanken\+Grotesk/i.test(html)).toBe(true);
    expect(/@import[^;]*Hanken/i.test(css)).toBe(false);
  });

  it("lists Hanken Grotesk first in the body font stack", () => {
    expect(/font-family:\s*["']Hanken Grotesk["']/i.test(css)).toBe(true);
  });

  it("sets the browser theme-color to the coral brand", () => {
    expect(/<meta\s+name="theme-color"\s+content="#f2683f"\s*\/?>/i.test(html)).toBe(true);
    expect(html).not.toContain("#1f8a5b");
  });
});
