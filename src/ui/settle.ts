import { el, mount } from "./dom";
import {
  balanceSummary,
  formatMoney,
  settleRows,
  settlementRows,
  type SettleRow,
  type SettlementRow,
} from "./viewmodel";
import { avatar } from "./avatar";
import type { Group } from "../types";

export interface SettleHandlers {
  /** Record a payment for an open debt (the creditor ticked "Mark paid"). */
  onMarkPaid: (row: SettleRow) => void;
  /** Undo a recorded payment (the creditor unticked it), reopening the debt. */
  onUnmarkPaid: (row: SettlementRow) => void;
}

/**
 * A checkbox with an in-flight guard: while its toggle handler is awaiting the
 * write, the box is disabled so a second toggle can't fire a duplicate.
 */
function toggleBox(checked: boolean, onToggle: () => void | Promise<void>): HTMLInputElement {
  const box = el("input", { type: "checkbox" });
  if (checked) box.checked = true;
  box.addEventListener("change", async () => {
    if (box.hasAttribute("disabled")) return; // ignore re-entrant toggles while a write is in flight
    box.setAttribute("disabled", "true");
    try {
      await onToggle();
    } catch {
      box.removeAttribute("disabled");
    }
  });
  return box;
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
      balances.map((b) => {
        const p = group.people.find((pp) => pp.id === b.personId);
        return el("li", { class: b.amount >= 0 ? "owed" : "owes" }, [
          el("span", { class: "bal-person" }, [
            p ? avatar(p, currentUid, { small: true }) : null,
            el("span", {}, b.name),
          ]),
          el(
            "span",
            { class: "bal-amt" },
            b.amount === 0
              ? "settled up"
              : b.amount > 0
                ? `is owed ${formatMoney(b.amount)}`
                : `owes ${formatMoney(-b.amount)}`,
          ),
        ]);
      }),
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
          // paid, so the Mark-paid checkbox appears only on rows where the
          // current user is the creditor. A name-only creditor (uid: null) never
          // matches, so a debt owed to someone without an app account can't be
          // marked paid until they join and link their identity.
          if (row.toId === currentPersonId) {
            actions.push(
              el("label", { class: "settle-check" }, [
                toggleBox(false, () => handlers.onMarkPaid(row)),
                el("span", {}, "Mark paid"),
              ]),
            );
          }
          return el("div", { class: "settle-row" }, [
            el("span", { class: "settle-desc" }, [
              el("span", { class: "settle-names" }, `${row.fromName} → ${row.toName}`),
            ]),
            el("span", { class: "settle-amt" }, formatMoney(row.amount)),
            el("span", { class: "settle-actions" }, actions),
          ]);
        }),
      ],
    );
  }

  // Recorded payments, shown as ticked checkboxes. The creditor can untick to
  // undo a payment (reopening the debt); everyone else sees it read-only.
  const paid = settlementRows(group);
  let payments: HTMLElement | null = null;
  if (paid.length > 0) {
    payments = el(
      "div",
      { class: "card" },
      [
        el("h3", {}, "Payments") as Node,
        ...paid.map((srow) => {
          const control =
            srow.toId === currentPersonId
              ? el("label", { class: "settle-check" }, [
                  toggleBox(true, () => handlers.onUnmarkPaid(srow)),
                  el("span", {}, "Paid"),
                ])
              : el("span", { class: "hint" }, "✓ Paid");
          return el("div", { class: "payment-row settle-row" }, [
            el("span", { class: "settle-desc" }, [
              el("span", { class: "settle-names" }, `${srow.fromName} → ${srow.toName}`),
            ]),
            el("span", { class: "settle-amt" }, formatMoney(srow.amount)),
            el("span", { class: "settle-actions" }, [control]),
          ]);
        }),
      ],
    );
  }

  mount(container, summary, list, payments);
}
