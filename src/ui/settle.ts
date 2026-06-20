import { el, mount } from "./dom";
import { balanceSummary, formatMoney, settleRows, type SettleRow } from "./viewmodel";
import type { Group } from "../types";

export interface SettleHandlers {
  onMarkPaid: (row: SettleRow) => void;
}

/** Render the "Settle up" view: balances summary + who-owes-whom with actions. */
export function renderSettle(container: HTMLElement, group: Group, handlers: SettleHandlers): void {
  const rows = settleRows(group);
  const balances = balanceSummary(group);

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
          if (row.venmoHref) {
            actions.push(
              el(
                "a",
                { class: "btn venmo", href: row.venmoHref, target: "_blank", rel: "noopener" },
                "Pay with Venmo",
              ),
            );
          } else {
            actions.push(el("span", { class: "hint" }, `Add ${row.toName}'s Venmo to enable payment`));
          }
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
