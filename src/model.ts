import type { Balance, Expense, Group, Person, Split, Transfer } from "./types";

/** Round to 2 decimal places (cents), avoiding binary float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toCents(n: number): number {
  return Math.round(n * 100);
}

export interface SplitValidation {
  valid: boolean;
  message?: string;
}

/**
 * Validate that a split is well-formed for a given total. Used by the UI to
 * block saving an expense whose split does not reconcile to the total.
 */
export function validateSplit(split: Split, total: number): SplitValidation {
  const { method, participants, values } = split;
  if (!participants || participants.length === 0) {
    return { valid: false, message: "Select at least one person to split with." };
  }
  if (!(total > 0)) {
    return { valid: false, message: "Amount must be greater than zero." };
  }

  switch (method) {
    case "equal":
      return { valid: true };
    case "exact": {
      const sum = participants.reduce((s, id) => s + (values[id] || 0), 0);
      if (toCents(sum) !== toCents(total)) {
        return { valid: false, message: `Exact amounts must add up to ${total}.` };
      }
      return { valid: true };
    }
    case "percent": {
      const sum = participants.reduce((s, id) => s + (values[id] || 0), 0);
      if (Math.round(sum * 100) !== 10000) {
        return { valid: false, message: "Percentages must add up to 100." };
      }
      return { valid: true };
    }
    case "shares": {
      const sum = participants.reduce((s, id) => s + (values[id] || 0), 0);
      if (sum <= 0) {
        return { valid: false, message: "Shares must add up to more than zero." };
      }
      return { valid: true };
    }
    default:
      return { valid: false, message: "Unknown split method." };
  }
}

/**
 * Distribute a total (in cents) across weights so the parts sum EXACTLY to the
 * total. Leftover cents from rounding are handed out one at a time to the
 * largest fractional remainders.
 */
function distributeCents(totalCents: number, ids: string[], weights: number[]): Record<string, number> {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const exact = weights.map((w) => (totalCents * w) / weightSum);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = totalCents - floors.reduce((s, v) => s + v, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((x, y) => y.frac - x.frac);

  const cents = floors.slice();
  for (let k = 0; k < remainder; k++) {
    cents[order[k % order.length].i] += 1;
  }

  const out: Record<string, number> = {};
  ids.forEach((id, i) => {
    out[id] = cents[i] / 100;
  });
  return out;
}

/**
 * Per-person owed amount for a single expense, keyed by Person.id. Only
 * participants appear in the result.
 */
export function computeShares(expense: Expense, _people: Person[]): Record<string, number> {
  const { amount, split } = expense;
  const { method, participants, values } = split;
  const totalCents = toCents(amount);

  switch (method) {
    case "equal":
      return distributeCents(totalCents, participants, participants.map(() => 1));
    case "shares":
      return distributeCents(
        totalCents,
        participants,
        participants.map((id) => values[id] || 0),
      );
    case "percent": {
      const out: Record<string, number> = {};
      for (const id of participants) {
        out[id] = round2((amount * (values[id] || 0)) / 100);
      }
      return out;
    }
    case "exact": {
      const out: Record<string, number> = {};
      for (const id of participants) {
        out[id] = round2(values[id] || 0);
      }
      return out;
    }
    default:
      return {};
  }
}

/**
 * Net balance per person across all expenses and settlements.
 * Positive => the person is owed money; negative => the person owes.
 */
export function computeBalances(group: Group): Balance[] {
  const net: Record<string, number> = {};
  for (const p of group.people) net[p.id] = 0;

  for (const expense of group.expenses) {
    // payer fronted the whole amount
    net[expense.paidBy] = (net[expense.paidBy] || 0) + expense.amount;
    // each participant owes their share
    const shares = computeShares(expense, group.people);
    for (const [id, owed] of Object.entries(shares)) {
      net[id] = (net[id] || 0) - owed;
    }
  }

  for (const s of group.settlements) {
    // paying down a debt increases the payer's net, decreases the receiver's
    net[s.from] = (net[s.from] || 0) + s.amount;
    net[s.to] = (net[s.to] || 0) - s.amount;
  }

  return group.people.map((p) => ({ personId: p.id, amount: round2(net[p.id] || 0) }));
}

/**
 * Greedy minimal set of transfers that settles all balances: repeatedly match
 * the largest creditor with the largest debtor. Produces at most n-1 transfers.
 */
export function simplifyDebts(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.amount > 0)
    .map((b) => ({ id: b.personId, amount: b.amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.amount < 0)
    .map((b) => ({ id: b.personId, amount: -b.amount }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const amount = round2(Math.min(credit.amount, debt.amount));
    if (amount > 0) {
      transfers.push({ from: debt.id, to: credit.id, amount });
    }
    credit.amount = round2(credit.amount - amount);
    debt.amount = round2(debt.amount - amount);
    if (credit.amount <= 0) ci++;
    if (debt.amount <= 0) di++;
  }
  return transfers;
}
