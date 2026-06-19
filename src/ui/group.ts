import { el, mount } from "./dom";
import { renderSettle } from "./settle";
import { renderExpenseForm } from "./expenseForm";
import { formatMoney } from "./viewmodel";
import { computeShares, round2 } from "../model";
import { normalizeHandle } from "../venmo";
import { genId } from "../db";
import type { Expense, GroupDoc, Person, Settlement } from "../types";

export interface GroupActions {
  currentUid: string;
  addPerson: (p: Person) => Promise<void>;
  updatePerson: (p: Person) => Promise<void>;
  removePerson: (personId: string) => Promise<void>;
  addExpense: (e: Expense) => Promise<void>;
  removeExpense: (expenseId: string) => Promise<void>;
  addSettlement: (s: Settlement) => Promise<void>;
  onBack: () => void;
  onCopyLink: () => Promise<void> | void;
}

type Tab = "expenses" | "people" | "settle" | "share";

/** Render a full group with tabbed sections. */
export function renderGroup(
  container: HTMLElement,
  group: GroupDoc,
  actions: GroupActions,
  tab: Tab = "expenses",
): void {
  const body = el("div", {});

  const setTab = (t: Tab) => renderGroup(container, group, actions, t);

  const tabBtn = (t: Tab, label: string) =>
    el("button", { class: `btn small ${t === tab ? "active" : ""}`, onClick: () => setTab(t) }, label);

  if (tab === "expenses") renderExpensesTab(body, group, actions);
  else if (tab === "people") renderPeopleTab(body, group, actions);
  else if (tab === "settle") renderSettleTab(body, group, actions);
  else renderShareTab(body, group, actions);

  mount(
    container,
    el("div", { class: "topbar" }, [
      el("div", { class: "row" }, [
        el("button", { class: "btn small", onClick: () => actions.onBack() }, "← Groups"),
        el("strong", { style: "margin-left:8px" }, group.name),
      ]),
    ]),
    el("div", { class: "tabs" }, [
      tabBtn("expenses", "Expenses"),
      tabBtn("people", "People"),
      tabBtn("settle", "Settle up"),
      tabBtn("share", "Share"),
    ]),
    body,
  );
}

function personName(group: GroupDoc, id: string): string {
  return group.people.find((p) => p.id === id)?.name ?? "Unknown";
}

function renderExpensesTab(body: HTMLElement, group: GroupDoc, actions: GroupActions) {
  const formHost = el("div", {});
  let formOpen = false;

  const openForm = () => {
    formOpen = true;
    if (group.people.length === 0) {
      mount(formHost, el("div", { class: "banner" }, "Add at least one person on the People tab first."));
      return;
    }
    renderExpenseForm(formHost, group.people, {
      onSave: async (expense) => {
        await actions.addExpense(expense);
        formOpen = false;
        mount(formHost);
      },
      onCancel: () => { formOpen = false; mount(formHost); },
    });
  };

  const list =
    group.expenses.length === 0
      ? el("div", { class: "card empty" }, "No expenses yet.")
      : el(
          "div",
          { class: "card" },
          [...group.expenses]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((e) => {
              const shares = (() => {
                try { return computeShares(e, group.people); } catch { return {}; }
              })();
              const detail = e.split.participants
                .map((id) => `${personName(group, id)} ${formatMoney(shares[id] ?? 0)}`)
                .join(" · ");
              return el("div", { class: "list-item" }, [
                el("span", { style: "flex:1" }, [
                  el("strong", {}, `${e.description} — ${formatMoney(e.amount)}`),
                  el("div", { class: "hint" }, `Paid by ${personName(group, e.paidBy)} · ${e.date}`),
                  el("div", { class: "hint" }, detail),
                ]),
                el("button", { class: "btn small danger", onClick: async () => { await actions.removeExpense(e.id); } }, "Delete"),
              ]);
            }),
        );

  mount(
    body,
    el("div", { class: "row" }, [
      el("button", { class: "btn primary", onClick: () => { if (!formOpen) openForm(); } }, "+ Add expense"),
    ]),
    formHost,
    list,
  );
}

function renderPeopleTab(body: HTMLElement, group: GroupDoc, actions: GroupActions) {
  const linked = group.people.some((p) => p.uid === actions.currentUid);

  const nameInput = el("input", { type: "text", placeholder: "Name" });
  const venmoInput = el("input", { type: "text", placeholder: "Venmo handle (optional, e.g. @jane)" });

  const addPerson = async (e: Event, linkSelf: boolean) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    await actions.addPerson({
      id: genId(),
      name,
      venmo: normalizeHandle(venmoInput.value),
      uid: linkSelf ? actions.currentUid : null,
    });
    nameInput.value = "";
    venmoInput.value = "";
  };

  const peopleList = el(
    "div",
    { class: "card" },
    [
      el("h3", {}, "People") as Node,
      ...group.people.map((p) => {
        const venmoField = el("input", {
          type: "text",
          value: p.venmo ? `@${p.venmo}` : "",
          placeholder: "Venmo handle",
          style: "max-width:200px",
          onChange: async (ev: Event) => {
            await actions.updatePerson({ ...p, venmo: normalizeHandle((ev.target as HTMLInputElement).value) });
          },
        });
        return el("div", { class: "list-item" }, [
          el("span", { style: "flex:1" }, [
            el("strong", {}, p.name),
            p.uid === actions.currentUid ? el("span", { class: "hint" }, " (you)") : null,
          ]),
          venmoField,
          el("button", { class: "btn small danger", onClick: async () => { await actions.removePerson(p.id); } }, "Remove"),
        ]);
      }),
    ],
  );

  const claimBanner = linked
    ? null
    : el("div", { class: "banner" }, [
        "You're a member but not linked to anyone in this group. Add yourself below (your name links to your account).",
      ]);

  mount(
    body,
    claimBanner,
    peopleList,
    el("div", { class: "card" }, [
      el("h3", {}, "Add a person"),
      el("form", { class: "stack", onSubmit: (e: Event) => addPerson(e, false) }, [
        nameInput,
        venmoInput,
        el("div", { class: "row" }, [
          el("button", { class: "btn primary", type: "submit" }, "Add person"),
          linked
            ? null
            : el("button", { class: "btn", type: "button", onClick: (e: Event) => addPerson(e, true) }, "Add as me"),
        ]),
      ]),
    ]),
  );
}

function renderSettleTab(body: HTMLElement, group: GroupDoc, actions: GroupActions) {
  renderSettle(body, group, {
    onMarkPaid: async (row) => {
      await actions.addSettlement({
        id: genId(),
        from: row.fromId,
        to: row.toId,
        amount: round2(row.amount),
        date: new Date().toISOString().slice(0, 10),
      });
    },
  });
}

function renderShareTab(body: HTMLElement, _group: GroupDoc, actions: GroupActions) {
  const link = window.location.href;
  const status = el("span", { class: "ok" });
  mount(
    body,
    el("div", { class: "card stack" }, [
      el("h3", {}, "Invite people"),
      el("p", { class: "hint" }, "Anyone you send this link to can sign in and join this group. Changes sync live for everyone."),
      el("input", { type: "text", value: link, readonly: true }),
      el("div", { class: "row" }, [
        el("button", {
          class: "btn primary",
          onClick: async () => {
            try { await actions.onCopyLink(); status.textContent = "Link copied!"; }
            catch { status.textContent = "Copy this link manually."; }
          },
        }, "Copy invite link"),
        status,
      ]),
    ]),
  );
}
