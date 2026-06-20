import { describe, it, expect } from "vitest";
import {
  authScreen,
  splitPreview,
  settleRows,
  settlementRows,
  balanceSummary,
  formatMoney,
  personLinkState,
  linkSummary,
  initials,
  personColor,
  emojiForExpense,
  currentUserNet,
  AVATAR_COLORS,
  YOU_COLOR,
} from "../../src/ui/viewmodel";
import type { Group, Person } from "../../src/types";

const people: Person[] = [
  { id: "a", name: "Alice", venmo: "alice-v", uid: "uA" },
  { id: "b", name: "Bob", venmo: null, uid: "uB" },
  { id: "c", name: "Carol", venmo: "carol-v", uid: null },
];

function group(over: Partial<Group> = {}): Group {
  return {
    name: "Trip",
    createdAt: 0,
    updatedAt: 0,
    ownerUid: "uA",
    memberUids: ["uA"],
    people,
    expenses: [],
    settlements: [],
    ...over,
  };
}

describe("formatMoney", () => {
  it("formats with a dollar sign and two decimals", () => {
    expect(formatMoney(5)).toBe("$5.00");
    expect(formatMoney(12.5)).toBe("$12.50");
  });
});

describe("authScreen", () => {
  it("shows the auth screen when signed out", () => {
    expect(authScreen(null)).toBe("auth");
  });
  it("shows verify when signed in but unverified", () => {
    expect(authScreen({ emailVerified: false })).toBe("verify");
  });
  it("shows the app when verified", () => {
    expect(authScreen({ emailVerified: true })).toBe("app");
  });
});

describe("splitPreview", () => {
  it("previews an equal split that reconciles to the total", () => {
    const preview = splitPreview(
      { method: "equal", participants: ["a", "b", "c"], values: {} },
      30,
      people,
    );
    expect(preview.valid).toBe(true);
    const sum = preview.rows.reduce((s, r) => s + r.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(30);
    expect(preview.rows.map((r) => r.name)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("flags an exact split that does not reconcile", () => {
    const preview = splitPreview(
      { method: "exact", participants: ["a", "b"], values: { a: 5, b: 10 } },
      30,
      people,
    );
    expect(preview.valid).toBe(false);
    expect(preview.message).toBeTruthy();
  });
});

describe("settleRows", () => {
  it("builds who-owes-whom rows with a Venmo link for creditors with a handle", () => {
    // Alice paid 30, split equally => Bob and Carol each owe 10.
    const g = group({
      expenses: [
        {
          id: "e1",
          description: "Dinner",
          amount: 30,
          paidBy: "a",
          date: "2026-01-01",
          split: { method: "equal", participants: ["a", "b", "c"], values: {} },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const rows = settleRows(g);
    expect(rows).toHaveLength(2);
    const bobRow = rows.find((r) => r.fromId === "b")!;
    expect(bobRow.toName).toBe("Alice");
    expect(bobRow.amount).toBe(10);
    // Alice has a venmo handle, so a link is present and pre-fills amount + note
    expect(bobRow.venmoHref).toContain("venmo.com/alice-v");
    expect(bobRow.venmoHref).toContain("amount=10.00");
    expect(bobRow.venmoHref).toContain("CashSplit");
  });

  it("omits the Venmo link when the creditor has no handle", () => {
    // Bob (no venmo) paid 20, split between Bob and Carol => Carol owes Bob 10.
    const g = group({
      expenses: [
        {
          id: "e1",
          description: "Cab",
          amount: 20,
          paidBy: "b",
          date: "2026-01-01",
          split: { method: "equal", participants: ["b", "c"], values: {} },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const rows = settleRows(g);
    const row = rows.find((r) => r.toId === "b")!;
    expect(row.venmoHref).toBeNull();
  });
});

describe("settlementRows", () => {
  it("resolves recorded settlements to named rows, most recent first", () => {
    const g = group({
      settlements: [
        { id: "s1", from: "b", to: "a", amount: 10, date: "2026-01-01" },
        { id: "s2", from: "c", to: "a", amount: 5, date: "2026-01-03" },
      ],
    });
    const rows = settlementRows(g);
    expect(rows.map((r) => r.id)).toEqual(["s2", "s1"]); // newest first by date
    const s1 = rows.find((r) => r.id === "s1")!;
    expect(s1.fromName).toBe("Bob");
    expect(s1.toName).toBe("Alice");
    expect(s1.toId).toBe("a");
    expect(s1.amount).toBe(10);
  });

  it("returns an empty list when there are no settlements", () => {
    expect(settlementRows(group())).toEqual([]);
  });
});

describe("personLinkState", () => {
  const p = (uid: string | null) => ({ id: "x", name: "X", venmo: null, uid });
  it("returns 'you' when the person is linked to the current account", () => {
    expect(personLinkState(p("uA"), "uA")).toBe("you");
  });
  it("returns 'linked' when the person is linked to a different account", () => {
    expect(personLinkState(p("uC"), "uA")).toBe("linked");
  });
  it("returns 'unlinked' when the person has no account", () => {
    expect(personLinkState(p(null), "uA")).toBe("unlinked");
  });
  it("never reports 'you' when there is no current account", () => {
    expect(personLinkState(p("uC"), null)).toBe("linked");
    expect(personLinkState(p(null), null)).toBe("unlinked");
  });
});

describe("linkSummary", () => {
  it("counts people linked to an account vs. total (mixed)", () => {
    // module `people`: Alice uA, Bob uB, Carol null => 2 of 3
    expect(linkSummary(group())).toEqual({ linked: 2, total: 3 });
  });
  it("counts all linked", () => {
    const g = group({ people: [
      { id: "a", name: "A", venmo: null, uid: "uA" },
      { id: "b", name: "B", venmo: null, uid: "uB" },
    ] });
    expect(linkSummary(g)).toEqual({ linked: 2, total: 2 });
  });
  it("counts none linked", () => {
    const g = group({ people: [{ id: "a", name: "A", venmo: null, uid: null }] });
    expect(linkSummary(g)).toEqual({ linked: 0, total: 1 });
  });
  it("handles an empty group", () => {
    const g = group({ people: [] });
    expect(linkSummary(g)).toEqual({ linked: 0, total: 0 });
  });
});

describe("initials", () => {
  it("uses the first letter of a single-word name", () => {
    expect(initials("Maya")).toBe("M");
    expect(initials("alice")).toBe("A");
    expect(initials("pocket-resp")).toBe("P");
  });
  it("uses the first letters of the first two words", () => {
    expect(initials("Maya Rivera")).toBe("MR");
    expect(initials("  jordan  lee  ")).toBe("JL");
  });
  it("falls back to '?' for a blank name", () => {
    expect(initials("   ")).toBe("?");
    expect(initials("")).toBe("?");
  });
});

describe("personColor", () => {
  const p = (id: string, uid: string | null) => ({ id, name: "X", venmo: null, uid });
  it("gives the current user the 'you' color", () => {
    expect(personColor(p("a", "uA"), "uA")).toBe(YOU_COLOR);
  });
  it("never uses the 'you' color for others or when no one is current", () => {
    expect(personColor(p("a", "uB"), "uA")).not.toBe(YOU_COLOR);
    expect(personColor(p("a", null), null)).not.toBe(YOU_COLOR);
  });
  it("derives a stable palette color from the id", () => {
    const c = personColor(p("xyz", null), "uA");
    expect(AVATAR_COLORS).toContain(c);
    expect(personColor(p("xyz", null), "uA")).toBe(c); // deterministic
  });
});

describe("emojiForExpense", () => {
  it("maps keywords to emoji", () => {
    expect(emojiForExpense("Groceries")).toBe("🛒");
    expect(emojiForExpense("Dinner at Luigi's")).toBe("🍝");
    expect(emojiForExpense("Gas")).toBe("⛽");
    expect(emojiForExpense("Weekend Cabin")).toBe("🏠");
    expect(emojiForExpense("Ski passes")).toBe("🎿");
  });
  it("falls back to a receipt for anything unmatched", () => {
    expect(emojiForExpense("Mystery thing")).toBe("🧾");
  });
});

describe("currentUserNet", () => {
  it("returns the current user's net balance in the group", () => {
    // Alice (uA) paid 30, split 3 ways => Alice is owed 20.
    const g = group({
      expenses: [
        {
          id: "e1",
          description: "Dinner",
          amount: 30,
          paidBy: "a",
          date: "2026-01-01",
          split: { method: "equal", participants: ["a", "b", "c"], values: {} },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    expect(currentUserNet(g, "uA")).toBe(20);
  });
  it("returns null when the current account is not linked to anyone", () => {
    expect(currentUserNet(group(), "uX")).toBeNull();
  });
});

describe("balanceSummary", () => {
  it("returns named balances summing to zero", () => {
    const g = group({
      expenses: [
        {
          id: "e1",
          description: "Dinner",
          amount: 30,
          paidBy: "a",
          date: "2026-01-01",
          split: { method: "equal", participants: ["a", "b", "c"], values: {} },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const summary = balanceSummary(g);
    const sum = summary.reduce((s, r) => s + r.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(0);
    expect(summary.find((r) => r.name === "Alice")!.amount).toBe(20);
  });
});
