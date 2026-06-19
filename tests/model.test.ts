import { describe, it, expect } from "vitest";
import {
  computeShares,
  computeBalances,
  simplifyDebts,
  validateSplit,
  round2,
} from "../src/model";
import type { Expense, Group, Person } from "../src/types";

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
    ...over,
  };
}

const people = [person("a"), person("b"), person("c")];

describe("round2", () => {
  it("rounds to cents", () => {
    expect(round2(10 / 3)).toBe(3.33);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("computeShares — equal", () => {
  it("splits evenly when it divides cleanly", () => {
    const shares = computeShares(expense({ amount: 30 }), people);
    expect(shares).toEqual({ a: 10, b: 10, c: 10 });
  });

  it("distributes remainder cents so the parts sum EXACTLY to the total", () => {
    const shares = computeShares(expense({ amount: 10 }), people); // 10 / 3
    const total = round2(shares.a + shares.b + shares.c);
    expect(total).toBe(10);
    // amounts are within a cent of each other
    const vals = Object.values(shares).sort();
    expect(vals[2] - vals[0]).toBeCloseTo(0.01, 5);
  });

  it("only charges listed participants", () => {
    const shares = computeShares(
      expense({ amount: 10, split: { method: "equal", participants: ["a", "b"], values: {} } }),
      people,
    );
    expect(shares.c).toBeUndefined();
    expect(round2(shares.a + shares.b)).toBe(10);
  });
});

describe("computeShares — exact", () => {
  it("uses the provided exact amounts", () => {
    const e = expense({
      amount: 30,
      split: { method: "exact", participants: ["a", "b", "c"], values: { a: 5, b: 10, c: 15 } },
    });
    expect(computeShares(e, people)).toEqual({ a: 5, b: 10, c: 15 });
  });
});

describe("computeShares — percent", () => {
  it("applies percentages of the total", () => {
    const e = expense({
      amount: 200,
      split: { method: "percent", participants: ["a", "b"], values: { a: 25, b: 75 } },
    });
    expect(computeShares(e, people)).toEqual({ a: 50, b: 150 });
  });
});

describe("computeShares — shares", () => {
  it("splits by relative weights and sums exactly to total", () => {
    const e = expense({
      amount: 100,
      split: { method: "shares", participants: ["a", "b", "c"], values: { a: 1, b: 1, c: 2 } },
    });
    const shares = computeShares(e, people);
    expect(round2(shares.a + shares.b + shares.c)).toBe(100);
    expect(shares.c).toBeCloseTo(50, 5);
  });
});

describe("validateSplit", () => {
  it("accepts a valid equal split", () => {
    expect(validateSplit(expense().split, 30).valid).toBe(true);
  });
  it("rejects exact amounts that do not sum to the total", () => {
    const r = validateSplit(
      { method: "exact", participants: ["a", "b"], values: { a: 5, b: 10 } },
      30,
    );
    expect(r.valid).toBe(false);
  });
  it("rejects percentages that do not sum to 100", () => {
    const r = validateSplit(
      { method: "percent", participants: ["a", "b"], values: { a: 10, b: 10 } },
      30,
    );
    expect(r.valid).toBe(false);
  });
  it("rejects empty participants", () => {
    expect(validateSplit({ method: "equal", participants: [], values: {} }, 30).valid).toBe(false);
  });
  it("rejects shares that are all zero", () => {
    const r = validateSplit(
      { method: "shares", participants: ["a", "b"], values: { a: 0, b: 0 } },
      30,
    );
    expect(r.valid).toBe(false);
  });
});

describe("computeBalances", () => {
  function group(over: Partial<Group> = {}): Group {
    return {
      name: "Trip",
      createdAt: 0,
      updatedAt: 0,
      ownerUid: "ua",
      memberUids: ["ua"],
      people,
      expenses: [],
      settlements: [],
      ...over,
    };
  }

  it("is zero with no activity", () => {
    const balances = computeBalances(group());
    expect(balances.every((b) => b.amount === 0)).toBe(true);
  });

  it("credits the payer and debits the participants", () => {
    // a pays 30, split equally among a,b,c => each owes 10.
    const g = group({ expenses: [expense({ amount: 30, paidBy: "a" })] });
    const map = Object.fromEntries(computeBalances(g).map((b) => [b.personId, b.amount]));
    expect(map.a).toBe(20); // paid 30, owes 10
    expect(map.b).toBe(-10);
    expect(map.c).toBe(-10);
  });

  it("balances always sum to zero", () => {
    const g = group({
      expenses: [
        expense({ id: "e1", amount: 30, paidBy: "a" }),
        expense({ id: "e2", amount: 17, paidBy: "b" }),
      ],
    });
    const sum = round2(computeBalances(g).reduce((s, b) => s + b.amount, 0));
    expect(sum).toBe(0);
  });

  it("settlements offset balances", () => {
    const g = group({
      expenses: [expense({ amount: 30, paidBy: "a" })], // b owes 10
      settlements: [{ id: "s1", from: "b", to: "a", amount: 10, date: "2026-01-02" }],
    });
    const map = Object.fromEntries(computeBalances(g).map((b) => [b.personId, b.amount]));
    expect(map.b).toBe(0); // paid off
    expect(map.a).toBe(10); // still owed by c
  });
});

describe("simplifyDebts", () => {
  it("produces no transfers when everyone is settled", () => {
    expect(simplifyDebts([{ personId: "a", amount: 0 }, { personId: "b", amount: 0 }])).toEqual([]);
  });

  it("matches a single debtor to a single creditor", () => {
    const transfers = simplifyDebts([
      { personId: "a", amount: 20 },
      { personId: "b", amount: -20 },
    ]);
    expect(transfers).toEqual([{ from: "b", to: "a", amount: 20 }]);
  });

  it("zeroes out all balances and is minimal", () => {
    const balances = [
      { personId: "a", amount: 20 },
      { personId: "b", amount: -10 },
      { personId: "c", amount: -10 },
    ];
    const transfers = simplifyDebts(balances);
    // applying transfers should zero everyone
    const net = Object.fromEntries(balances.map((b) => [b.personId, b.amount]));
    for (const t of transfers) {
      net[t.from] += t.amount;
      net[t.to] -= t.amount;
    }
    expect(Object.values(net).every((v) => round2(v) === 0)).toBe(true);
    // minimal: at most n-1 transfers
    expect(transfers.length).toBeLessThanOrEqual(2);
  });
});
