import { el, mount } from "./dom";
import { balanceSummary, formatMoney, settleRows, type SettleRow } from "./viewmodel";
import type { Group } from "../types";

export interface SettleHandlers {
  onMarkPaid: (row: SettleRow) => void;
}

/**
 * Render the "Settle up" view: balances summary + who-owes-whom with actions.
 *
 * `currentUid` is the Firebase uid of the logged-in user; it gates the
 * per-row actions: "Pay with Venmo" appears only on rows where that user owes
 * (the debtor), and "Mark paid" appears only on rows where that user is owed
 * (the creditor) — only the person owed can confirm a debt was paid.
 */
export function renderSettle(
  container: HTMLElement,
  group: Group,
  currentUid: string,
  handlers: SettleHandlers,
): void {
  const rows = settleRows(group);
  const balances = balanceSummary(group);

  // The logged-in user's Person.id in this group, or null if they aren't a
  // linked member. Used to show the Venmo action only on debts they owe.
  const currentPersonId = group.people.find((p) => p.uid === currentUid)?.id ?? null;

  const summary = el("div", { class: "card" }, [
    el("h3", {}, "Balances"),
    el(
      "ul",
      { class: "balances" },
      balances.map((b) =>
        el("li", { class: b.amount >= 0 ? "owed" : "owes" }, [
          el("span", {}, b.name),
          el(
            "span",
            {},
            b.amount === 0
              ? "settled up"
              : b.amount > 0
                ? `is owed ${formatMoney(b.amount)}`
                : `owes ${formatMoney(-b.amount)}`,
          ),
        ]),
      ),
    ),
  ]);

  let list: HTMLElement;
  if (rows.length === 0) {
    list = el("div", { class: "card empty" }, "🎉 Everyone is settled up — nothing to pay.");
  } else {
    list = el(
      "div",
      { class: "card" },
      [
        el("h3", {}, "Who pays whom") as Node,
        ...rows.map((row) => {
          const actions: Node[] = [];
          // Only the debtor can pay a debt from their own Venmo, so the Venmo
          // action (and its "add a handle" hint) appears only on the current
          // user's own rows.
          if (row.fromId === currentPersonId) {
            if (row.venmoHref) {
              actions.push(
                el(
                  "a",
                  { class: "btn venmo", href: row.venmoHref, target: "_blank", rel: "noopener" },
                  "Pay with Venmo",
                ),
              );
            } else {
              actions.push(
                el("span", { class: "hint" }, `Add ${row.toName}'s Venmo to enable payment`),
              );
            }
          }
          // Only the person who is owed (the creditor) can confirm a debt was
          // paid, so "Mark paid" appears only on rows where the current user is
          // the creditor. A name-only creditor (uid: null) never matches, so a
          // debt owed to someone without an app account can't be marked paid
          // until they join and link their identity.
          if (row.toId === currentPersonId) {
            actions.push(
              el("button", {
                class: "btn",
                onClick: async (ev: Event) => {
                  const btn = ev.currentTarget as HTMLButtonElement;
                  if (btn.hasAttribute("disabled")) return; // ignore double-clicks while in flight
                  btn.setAttribute("disabled", "true");
                  try {
                    await handlers.onMarkPaid(row);
                  } catch {
                    btn.removeAttribute("disabled");
                  }
                },
              }, "Mark paid"),
            );
          }
          return el("div", { class: "settle-row" }, [
            el("span", { class: "settle-desc" }, `${row.fromName} → ${row.toName}`),
            el("span", { class: "settle-amt" }, formatMoney(row.amount)),
            el("span", { class: "settle-actions" }, actions),
          ]);
        }),
      ],
    );
  }

  mount(container, summary, list);
}
