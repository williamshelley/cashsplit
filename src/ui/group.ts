import { el, mount } from "./dom";
import { confirmModal, promptModal } from "./modal";
import { renderSettle } from "./settle";
import { renderExpenseForm } from "./expenseForm";
import {
  formatMoney,
  personLinkState,
  linkSummary,
  balanceSummary,
  emojiForExpense,
  type LinkState,
} from "./viewmodel";
import { avatar } from "./avatar";
import { computeShares, round2 } from "../model";
import { normalizeHandle } from "../venmo";
import { genId } from "../db";
import type { Expense, ExpenseInput, GroupDoc, Person, Settlement } from "../types";

export interface GroupActions {
  currentUid: string;
  addPerson: (p: Person) => Promise<void>;
  /** Update the Venmo handle of the current user's own linked person. */
  updateOwnVenmo: (venmo: string | null) => Promise<void>;
  /** Update the display name of the current user's own linked person. */
  updateOwnName: (name: string) => Promise<void>;
  /** Link the current user to the person with the given id. */
  linkPerson: (personId: string) => Promise<void>;
  removePerson: (personId: string) => Promise<void>;
  addExpense: (e: ExpenseInput) => Promise<void>;
  updateExpense: (e: ExpenseInput) => Promise<void>;
  removeExpense: (expenseId: string) => Promise<void>;
  addSettlement: (s: Settlement) => Promise<void>;
  onBack: () => void;
  onCopyLink: () => Promise<void> | void;
  /**
   * Notify the parent that the active tab changed, so it can preserve the tab
   * across live re-renders. If omitted, tab switching is handled internally.
   */
  onTabChange?: (tab: GroupTab) => void;
}

export type GroupTab = "expenses" | "people" | "settle" | "share";
type Tab = GroupTab;

/** Render a full group with tabbed sections. */
export function renderGroup(
  container: HTMLElement,
  group: GroupDoc,
  actions: GroupActions,
  tab: Tab = "expenses",
): void {
  const body = el("div", {});

  const setTab = (t: Tab) => {
    if (actions.onTabChange) actions.onTabChange(t);
    else renderGroup(container, group, actions, t);
  };

  const tabBtn = (t: Tab, label: string) =>
    el("button", { class: `btn small ${t === tab ? "active" : ""}`, onClick: () => setTab(t) }, label);

  if (tab === "expenses") renderExpensesTab(body, group, actions);
  else if (tab === "people") renderPeopleTab(body, group, actions);
  else if (tab === "settle") renderSettleTab(body, group, actions);
  else renderShareTab(body, group, actions);

  mount(
    container,
    el("div", { class: "topbar group-topbar" }, [
      el(
        "button",
        { class: "btn icon-btn", onClick: () => actions.onBack(), "aria-label": "Back to groups" },
        "←",
      ),
      el("div", { class: "group-heading" }, [
        el("strong", { class: "group-title" }, group.name),
        el(
          "div",
          { class: "hint" },
          `${plural(group.people.length, "person", "people")} · ${plural(group.expenses.length, "expense", "expenses")}`,
        ),
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A small right-aligned net-balance badge: owed (green) / owes (coral) / settled. */
function personNetEl(amount: number): HTMLElement {
  if (Math.abs(amount) < 0.005) {
    return el("div", { class: "net net-zero" }, [el("div", { class: "net-label" }, "settled")]);
  }
  const pos = amount > 0;
  return el("div", { class: `net ${pos ? "net-pos" : "net-neg"}` }, [
    el("div", { class: "net-amt" }, formatMoney(Math.abs(amount))),
    el("div", { class: "net-label" }, pos ? "owed" : "owes"),
  ]);
}

const LINK_LABEL: Record<LinkState, string> = {
  you: "You",
  linked: "Linked",
  unlinked: "Not linked",
};

/** A small status pill showing whether a person is linked to an account. */
function linkBadge(state: LinkState): HTMLElement {
  return el("span", { class: `badge badge-${state}` }, LINK_LABEL[state]);
}

function renderExpensesTab(body: HTMLElement, group: GroupDoc, actions: GroupActions) {
  const formHost = el("div", {});
  let formOpen = false;

  // `initial` set => editing that expense; omitted => adding a new one.
  const openForm = (initial?: Expense) => {
    formOpen = true;
    if (group.people.length === 0) {
      mount(formHost, el("div", { class: "banner" }, "Add at least one person on the People tab first."));
      return;
    }
    renderExpenseForm(
      formHost,
      group.people,
      {
        onSave: async (expense) => {
          if (initial) await actions.updateExpense(expense);
          else await actions.addExpense(expense);
          formOpen = false;
          mount(formHost);
        },
        onCancel: () => { formOpen = false; mount(formHost); },
      },
      initial,
    );
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
              const edited = e.updatedAt != null && e.createdAt != null && e.updatedAt > e.createdAt;
              return el("div", { class: "list-item expense" }, [
                el("div", { class: "icon-tile" }, emojiForExpense(e.description)),
                el("div", { class: "expense-main" }, [
                  el("div", { class: "expense-head" }, [
                    el("strong", { class: "expense-title" }, e.description),
                    el("span", { class: "expense-amt" }, formatMoney(e.amount)),
                  ]),
                  el(
                    "div",
                    { class: "hint" },
                    `Paid by ${personName(group, e.paidBy)} · ${e.date}${edited ? " · edited" : ""}`,
                  ),
                  el("div", { class: "hint split-detail" }, detail),
                  el("div", { class: "row expense-actions" }, [
                    el("button", { class: "btn small", onClick: () => openForm(e) }, "Edit"),
                    el("button", { class: "btn small danger", onClick: async () => { await actions.removeExpense(e.id); } }, "Delete"),
                  ]),
                ]),
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

  // Venmo is intentionally not collected here: a handle can only be set by the
  // account it belongs to, on its own row below (after "Add as me" / "This is me").
  const addPerson = async (e: Event, linkSelf: boolean) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    await actions.addPerson({
      id: genId(),
      name,
      venmo: null,
      uid: linkSelf ? actions.currentUid : null,
    });
    nameInput.value = "";
  };

  const currentPerson = group.people.find((p) => p.uid === actions.currentUid);

  const confirmLink = (p: Person) => {
    const message: (Node | string)[] = [
      p.uid
        ? el("p", {}, [
            el("strong", {}, p.name),
            " is already linked to another account. Connecting will move that link to you.",
          ])
        : el("p", {}, ["Connect your account to ", el("strong", {}, p.name), "?"]),
    ];
    if (currentPerson && currentPerson.id !== p.id) {
      message.push(
        el("p", { class: "hint" }, ["You'll be unlinked from ", el("strong", {}, currentPerson.name), "."]),
      );
    }
    confirmModal({
      title: "Is this you?",
      message,
      confirmLabel: "This is me",
      danger: p.uid !== null,
      onConfirm: () => actions.linkPerson(p.id),
    });
  };

  const summary = linkSummary(group);
  const balances = new Map(balanceSummary(group).map((b) => [b.personId, b.amount]));
  const peopleList = el(
    "div",
    { class: "card" },
    [
      el("h3", {}, "People") as Node,
      el("div", { class: "hint" }, `${summary.linked} of ${summary.total} linked`) as Node,
      ...group.people.map((p) => {
        const isMe = p.uid === actions.currentUid;
        // Only the linked account may edit its own handle. Everyone else's is
        // shown read-only so they stay visible for paying that person.
        const venmoField = isMe
          ? el("input", {
              type: "text",
              class: "venmo-input",
              value: p.venmo ? `@${p.venmo}` : "",
              placeholder: "Add your Venmo handle",
              onChange: async (ev: Event) => {
                await actions.updateOwnVenmo(normalizeHandle((ev.target as HTMLInputElement).value));
              },
            })
          : el("span", { class: "hint venmo-readonly" }, p.venmo ? `@${p.venmo}` : "No Venmo handle");
        // Only the linked account may rename its own person.
        const editNameBtn = isMe
          ? el(
              "button",
              {
                class: "btn small",
                onClick: () =>
                  promptModal({
                    title: "Edit your name",
                    initialValue: p.name,
                    confirmLabel: "Save",
                    onSubmit: (name) => actions.updateOwnName(name),
                  }),
              },
              "Edit",
            )
          : null;
        return el("div", { class: "list-item person" }, [
          avatar(p, actions.currentUid),
          el("div", { class: "person-main" }, [
            el("div", { class: "person-head" }, [
              el("strong", {}, p.name),
              linkBadge(personLinkState(p, actions.currentUid)),
              editNameBtn,
            ]),
            venmoField,
          ]),
          el("div", { class: "person-side" }, [
            personNetEl(balances.get(p.id) ?? 0),
            el("div", { class: "person-actions" }, [
              // Let a member claim any person but the one they're already linked to.
              isMe ? null : el("button", { class: "btn small", onClick: () => confirmLink(p) }, "This is me"),
              el("button", { class: "btn small danger", onClick: async () => { await actions.removePerson(p.id); } }, "Remove"),
            ]),
          ]),
        ]);
      }),
    ],
  );

  const claimBanner = linked
    ? null
    : el("div", { class: "banner" }, [
        "You're a member but not linked to anyone yet. Find your name below and tap \"This is me\", or add yourself.",
      ]);

  mount(
    body,
    claimBanner,
    peopleList,
    el("div", { class: "card" }, [
      el("h3", {}, "Add a person"),
      el("form", { class: "stack", onSubmit: (e: Event) => addPerson(e, false) }, [
        nameInput,
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
  renderSettle(body, group, actions.currentUid, {
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
