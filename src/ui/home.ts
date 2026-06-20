import { el, mount } from "./dom";
import type { GroupDoc } from "../types";

export interface HomeActions {
  onOpen: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onLogout: () => Promise<void>;
  userEmail: string;
}

/** Render the home screen: the user's groups + a create form. */
export function renderHome(container: HTMLElement, groups: GroupDoc[], actions: HomeActions): void {
  const nameInput = el("input", { type: "text", placeholder: "New group name (e.g. Ski Trip)" });
  const createBtn = el("button", { class: "btn primary", type: "submit" }, "Create group");

  const onCreate = async (e: Event) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    createBtn.setAttribute("disabled", "true");
    try {
      await actions.onCreate(name);
      nameInput.value = "";
    } finally {
      createBtn.removeAttribute("disabled");
    }
  };

  const groupList =
    groups.length === 0
      ? el("div", { class: "card empty" }, "No groups yet — create one to get started.")
      : el(
          "div",
          { class: "card" },
          [
            el("h3", {}, "Your groups") as Node,
            ...[...groups]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((g) =>
                el("div", { class: "list-item" }, [
                  el("span", { style: "flex:1" }, [
                    el("strong", {}, g.name),
                    el("div", { class: "hint" }, `${g.people.length} people · ${g.expenses.length} expenses`),
                  ]),
                  el("button", { class: "btn small", onClick: () => actions.onOpen(g.id) }, "Open"),
                ]),
              ),
          ],
        );

  mount(
    container,
    el("div", { class: "topbar" }, [
      el("div", { class: "brand" }, [el("span", {}, "Cash"), "Split"]),
      el("div", { class: "row" }, [
        el("span", { class: "hint" }, actions.userEmail),
        el("button", { class: "btn small", onClick: () => actions.onLogout() }, "Log out"),
      ]),
    ]),
    groupList,
    el("div", { class: "card" }, [
      el("h3", {}, "Start a new group"),
      el("form", { class: "stack", onSubmit: onCreate }, [nameInput, createBtn]),
    ]),
  );
}
