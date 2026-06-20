import { computeBalances, computeShares, simplifyDebts, validateSplit } from "../model";
import { venmoPayLink } from "../venmo";
import type { Group, Person, Split } from "../types";

export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Avatar color for the current user; the warm palette is for everyone else. */
export const YOU_COLOR = "#5b8def";
export const AVATAR_COLORS = ["#e0607e", "#3fb38b", "#e8a13c", "#9a6bd6", "#d68a3f", "#4aa3c2"];

/** 1–2 uppercase initials for an avatar; "?" for a blank name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

/** Deterministic avatar color: the "you" color for the current user, else by id. */
export function personColor(person: Person, currentUid: string | null): string {
  if (currentUid != null && person.uid === currentUid) return YOU_COLOR;
  let h = 0;
  for (let i = 0; i < person.id.length; i++) h = (h * 31 + person.id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Keyword → emoji for an expense's icon tile, first match wins; receipt is the default.
const EXPENSE_EMOJI: Array<[RegExp, string]> = [
  [/grocer|market|snack/, "🛒"],
  [/dinner|lunch|restaurant|meal|pizza|sushi|luigi|brunch|coffee|drink|\bbar\b|beer|wine|food/, "🍝"],
  [/gas|fuel|petrol/, "⛽"],
  [/rent|cabin|house|airbnb|hotel|lodg|\bstay\b/, "🏠"],
  [/ski|lift|snow|board/, "🎿"],
  [/wifi|internet|phone|data|cell/, "📶"],
  [/clean|laundry|soap/, "🧽"],
  [/part(y|ies)|celebrat|gift/, "🎉"],
];

/** A best-effort emoji icon for an expense, derived from its description. */
export function emojiForExpense(description: string): string {
  const d = description.toLowerCase();
  for (const [re, emoji] of EXPENSE_EMOJI) if (re.test(d)) return emoji;
  return "🧾";
}

/** The current user's net balance in a group, or null if they aren't linked. */
export function currentUserNet(group: Group, currentUid: string): number | null {
  const me = group.people.find((p) => p.uid === currentUid);
  if (!me) return null;
  return computeBalances(group).find((b) => b.personId === me.id)?.amount ?? 0;
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

export interface SettlementRow {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
}

/** Recorded payments (settlements) with resolved names, most recent first. */
export function settlementRows(group: Group): SettlementRow[] {
  return [...group.settlements]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((s) => ({
      id: s.id,
      fromId: s.from,
      toId: s.to,
      fromName: nameOf(group.people, s.from),
      toName: nameOf(group.people, s.to),
      amount: s.amount,
    }));
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
