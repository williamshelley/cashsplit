import { computeBalances, computeShares, simplifyDebts, validateSplit } from "../model";
import { venmoPayLink } from "../venmo";
import type { Group, Person, Split } from "../types";

export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export type AuthScreen = "auth" | "verify" | "app";

/** Which top-level screen to show for the given auth state. */
export function authScreen(user: { emailVerified: boolean } | null): AuthScreen {
  if (!user) return "auth";
  return user.emailVerified ? "app" : "verify";
}

export interface SplitPreviewRow {
  personId: string;
  name: string;
  amount: number;
}

export interface SplitPreview {
  valid: boolean;
  message?: string;
  rows: SplitPreviewRow[];
}

function nameOf(people: Person[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? "Unknown";
}

/** Best-effort per-person preview of a split plus validation status. */
export function splitPreview(split: Split, amount: number, people: Person[]): SplitPreview {
  const validation = validateSplit(split, amount);
  let shares: Record<string, number> = {};
  try {
    shares = computeShares({ id: "_", description: "", amount, paidBy: "", date: "", split }, people);
  } catch {
    shares = {};
  }
  const rows = split.participants.map((id) => ({
    personId: id,
    name: nameOf(people, id),
    amount: shares[id] ?? 0,
  }));
  return { valid: validation.valid, message: validation.message, rows };
}

export interface SettleRow {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
  /** Venmo deep link to pay the creditor, or null if they have no handle. */
  venmoHref: string | null;
}

/** Simplified who-owes-whom rows, each with a ready-to-use Venmo link. */
export function settleRows(group: Group): SettleRow[] {
  const transfers = simplifyDebts(computeBalances(group));
  return transfers.map((t) => {
    const creditor = group.people.find((p) => p.id === t.to);
    let venmoHref: string | null = null;
    try {
      venmoHref = venmoPayLink({
        handle: creditor?.venmo ?? null,
        amount: t.amount,
        note: `CashSplit: ${group.name}`,
      });
    } catch {
      venmoHref = null;
    }
    return {
      fromId: t.from,
      toId: t.to,
      fromName: nameOf(group.people, t.from),
      toName: nameOf(group.people, t.to),
      amount: t.amount,
      venmoHref,
    };
  });
}

export interface BalanceRow {
  personId: string;
  name: string;
  amount: number;
}

/** Named net balances, largest creditor first. */
export function balanceSummary(group: Group): BalanceRow[] {
  return computeBalances(group)
    .map((b) => ({ personId: b.personId, name: nameOf(group.people, b.personId), amount: b.amount }))
    .sort((a, b) => b.amount - a.amount);
}

export type LinkState = "you" | "linked" | "unlinked";

/** How a person relates to the current account: you, linked to another account, or unlinked. */
export function personLinkState(person: Person, currentUid: string | null): LinkState {
  if (person.uid == null) return "unlinked";
  if (person.uid === currentUid) return "you";
  return "linked";
}

export interface LinkSummary {
  linked: number;
  total: number;
}

/** Count of people linked to an account vs. total people in the group. */
export function linkSummary(group: Group): LinkSummary {
  return {
    linked: group.people.filter((p) => p.uid != null).length,
    total: group.people.length,
  };
}
