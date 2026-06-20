import { describe, it, expect } from "vitest";
import { groupExpensesToCsv, csvFilename } from "../src/export";
import type { Expense, GroupDoc, Person, Settlement } from "../src/types";

function person(id: string, name = id): Person {
  return { id, name, venmo: null, uid: null };
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    description: "Dinner",
    amount: 30,
    paidBy: "a",
    date: "2026-01-01",
    split: { method: "equal", participants: ["a", "b", "c"], values: {} },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function settlement(over: Partial<Settlement> = {}): Settlement {
  return { id: "s1", from: "b", to: "a", amount: 30, date: "2026-06-10", ...over };
}

function group(over: Partial<GroupDoc> = {}): GroupDoc {
  return {
    id: "g1",
    name: "Ski Trip",
    createdAt: 0,
    updatedAt: 0,
    ownerUid: "u1",
    memberUids: ["u1"],
    people: [person("a", "Alice"), person("b", "Bob"), person("c", "Carol")],
    expenses: [],
    settlements: [],
    ...over,
  };
}

describe("groupExpensesToCsv", () => {
  it("produces the full two-section CSV for a typical group", () => {
    const g = group({
      expenses: [
        // intentionally out of date order to prove sorting
        expense({ id: "e1", description: "Gas", amount: 45, paidBy: "b", date: "2026-06-03" }),
        expense({ id: "e2", description: "Groceries", amount: 60, paidBy: "a", date: "2026-06-01" }),
      ],
      settlements: [settlement({ from: "b", to: "a", amount: 30, date: "2026-06-10" })],
    });

    expect(groupExpensesToCsv(g)).toBe(
      [
        "--- EXPENSES ---",
        "Date,Description,Amount,Paid By,Split,Alice,Bob,Carol",
        "2026-06-01,Groceries,60.00,Alice,equal,20.00,20.00,20.00",
        "2026-06-03,Gas,45.00,Bob,equal,15.00,15.00,15.00",
        "TOTAL,,105.00,,,35.00,35.00,35.00",
        "",
        "--- SETTLEMENTS ---",
        "Date,From,To,Amount",
        "2026-06-10,Bob,Alice,30.00",
      ].join("\n"),
    );
  });

  it("lists one person column per group member in people order", () => {
    const header = groupExpensesToCsv(group()).split("\n")[1];
    expect(header).toBe("Date,Description,Amount,Paid By,Split,Alice,Bob,Carol");
  });

  it("leaves a blank cell for people who are not participants in an expense", () => {
    const g = group({
      expenses: [
        expense({
          id: "e1",
          description: "Cab",
          amount: 10,
          paidBy: "a",
          date: "2026-06-01",
          split: { method: "equal", participants: ["a", "b"], values: {} },
        }),
      ],
    });
    const rows = groupExpensesToCsv(g).split("\n");
    // Alice,Bob get 5.00 each; Carol's cell is blank (trailing empty field)
    expect(rows[2]).toBe("2026-06-01,Cab,10.00,Alice,equal,5.00,5.00,");
    // Carol's column total is 0.00
    expect(rows[3]).toBe("TOTAL,,10.00,,,5.00,5.00,0.00");
  });

  it("sums the amount and each person column in the TOTAL row", () => {
    const g = group({
      expenses: [
        expense({ id: "e1", amount: 30, date: "2026-06-01" }), // 10 each
        expense({ id: "e2", amount: 60, date: "2026-06-02" }), // 20 each
      ],
    });
    const total = groupExpensesToCsv(g).split("\n").find((l) => l.startsWith("TOTAL"));
    expect(total).toBe("TOTAL,,90.00,,,30.00,30.00,30.00");
  });

  it("resolves settlement person ids to names and sorts by date", () => {
    const g = group({
      settlements: [
        settlement({ id: "s1", from: "c", to: "a", amount: 5, date: "2026-07-02" }),
        settlement({ id: "s2", from: "b", to: "a", amount: 12.5, date: "2026-07-01" }),
      ],
    });
    const csv = groupExpensesToCsv(g);
    const idx = csv.indexOf("--- SETTLEMENTS ---");
    const settleBlock = csv.slice(idx).split("\n");
    expect(settleBlock).toEqual([
      "--- SETTLEMENTS ---",
      "Date,From,To,Amount",
      "2026-07-01,Bob,Alice,12.50",
      "2026-07-02,Carol,Alice,5.00",
    ]);
  });

  it("escapes cells containing commas, quotes, or newlines", () => {
    const g = group({
      people: [person("a", "O'Brien, Al"), person("b", 'Bob "the Boss"')],
      expenses: [
        expense({
          id: "e1",
          description: 'Gas, "premium"',
          amount: 10,
          paidBy: "a",
          date: "2026-06-01",
          split: { method: "equal", participants: ["a", "b"], values: {} },
        }),
      ],
    });
    const rows = groupExpensesToCsv(g).split("\n");
    expect(rows[1]).toBe('Date,Description,Amount,Paid By,Split,"O\'Brien, Al","Bob ""the Boss"""');
    expect(rows[2]).toBe('2026-06-01,"Gas, ""premium""",10.00,"O\'Brien, Al",equal,5.00,5.00');
  });

  it("handles an empty group: headers plus a zeroed TOTAL row", () => {
    const csv = groupExpensesToCsv(group({ expenses: [], settlements: [] }));
    expect(csv).toBe(
      [
        "--- EXPENSES ---",
        "Date,Description,Amount,Paid By,Split,Alice,Bob,Carol",
        "TOTAL,,0.00,,,0.00,0.00,0.00",
        "",
        "--- SETTLEMENTS ---",
        "Date,From,To,Amount",
      ].join("\n"),
    );
  });
});

describe("csvFilename", () => {
  it("slugifies the group name", () => {
    expect(csvFilename(group({ name: "Ski Trip" }))).toBe("ski-trip-expenses.csv");
    expect(csvFilename(group({ name: "Beach House 2026!" }))).toBe("beach-house-2026-expenses.csv");
  });

  it("falls back to a default when the name has no usable characters", () => {
    expect(csvFilename(group({ name: "   " }))).toBe("group-expenses.csv");
  });
});
