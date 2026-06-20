import { el, mount } from "./dom";
import { promptModal } from "./modal";
import { avatarStack, youAvatar } from "./avatar";
import { currentUserNet, formatMoney } from "./viewmodel";
import type { GroupDoc } from "../types";

export interface HomeActions {
  onOpen: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onLogout: () => Promise<void>;
  userEmail: string;
  /** Firebase uid of the signed-in user — drives per-group balances and avatars. */
  currentUid: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A net amount + label from the current user's perspective for a group. */
function netView(net: number | null): { amount: string; label: string; cls: string } {
  if (net == null || Math.abs(net) < 0.005) return { amount: "$0.00", label: "all square", cls: "net-zero" };
  if (net > 0) return { amount: formatMoney(net), label: "you're owed", cls: "net-pos" };
  return { amount: formatMoney(-net), label: "you owe", cls: "net-neg" };
}

/** Render the home screen: the user's groups (with balances) + a create button. */
export function renderHome(container: HTMLElement, groups: GroupDoc[], actions: HomeActions): void {
  const sorted = [...groups].sort((a, b) => b.updatedAt - a.updatedAt);
  const nets = sorted.map((g) => currentUserNet(g, actions.currentUid) ?? 0);
  const overall = nets.reduce((s, n) => s + n, 0);
  const summary =
    Math.abs(overall) < 0.005
      ? "You're all settled up across your groups."
      : overall > 0
        ? `Overall, you're owed ${formatMoney(overall)}.`
        : `Overall, you owe ${formatMoney(-overall)}.`;

  const newGroupBtn = el(
    "button",
    {
      class: "btn dashed new-group",
      onClick: () =>
        promptModal({
          title: "New group",
          placeholder: "e.g. Ski Trip",
          confirmLabel: "Create",
          onSubmit: (name) => actions.onCreate(name),
        }),
    },
    "+ New group",
  );

  const groupCards = sorted.map((g, i) => {
    const net = netView(nets[i]);
    return el("div", { class: "card group-card", onClick: () => actions.onOpen(g.id) }, [
      el("div", { class: "group-card-top" }, [
        el("div", { class: "group-card-info" }, [
          el("strong", { class: "group-name" }, g.name),
          el("div", { class: "hint" }, plural(g.people.length, "person", "people")),
        ]),
        el("div", { class: `net ${net.cls}` }, [
          el("div", { class: "net-amt" }, net.amount),
          el("div", { class: "net-label" }, net.label),
        ]),
      ]),
      el("div", { class: "group-card-bottom" }, [
        avatarStack(g.people, actions.currentUid),
        el("span", { class: "hint" }, plural(g.expenses.length, "expense", "expenses")),
      ]),
    ]);
  });

  mount(
    container,
    el("div", { class: "topbar" }, [
      el("div", { class: "brand-lockup" }, [
        el("div", { class: "logo" }, "$"),
        el("div", { class: "brand" }, [el("span", {}, "Cash"), "Split"]),
      ]),
      el("div", { class: "row" }, [
        youAvatar(actions.userEmail || "You"),
        el("button", { class: "btn small", onClick: () => actions.onLogout() }, "Log out"),
      ]),
    ]),
    el("h2", {}, "Your groups"),
    groups.length === 0
      ? el("div", { class: "card empty" }, "No groups yet — create your first one below.")
      : el("p", { class: "muted home-summary" }, summary),
    ...groupCards,
    newGroupBtn,
  );
}
