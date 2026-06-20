// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderGroup, type GroupActions } from "../../src/ui/group";
import type { GroupDoc } from "../../src/types";

function group(): GroupDoc {
  return {
    id: "g1",
    name: "Tahoe Ski Trip",
    createdAt: 0,
    updatedAt: 0,
    ownerUid: "uA",
    memberUids: ["uA"],
    people: [{ id: "a", name: "Alice", venmo: "alice-v", uid: "uA" }],
    expenses: [],
    settlements: [],
  };
}

// A group with an owner (Alice/uA), an unlinked person (Bob), and a person
// linked to a different account (Carol/uC).
function multiGroup(): GroupDoc {
  return {
    ...group(),
    memberUids: ["uA", "uX"],
    people: [
      { id: "a", name: "Alice", venmo: null, uid: "uA" },
      { id: "b", name: "Bob", venmo: null, uid: null },
      { id: "c", name: "Carol", venmo: null, uid: "uC" },
    ],
  };
}

function actions(over: Partial<GroupActions> = {}): GroupActions {
  return {
    currentUid: "uA",
    addPerson: vi.fn(),
    updatePerson: vi.fn(),
    linkPerson: vi.fn(),
    removePerson: vi.fn(),
    addExpense: vi.fn(),
    removeExpense: vi.fn(),
    addSettlement: vi.fn(),
    onBack: vi.fn(),
    onCopyLink: vi.fn(),
    ...over,
  };
}

function personRow(container: HTMLElement, name: string): HTMLElement {
  return Array.from(container.querySelectorAll(".list-item")).find(
    (row) => row.querySelector("strong")?.textContent === name,
  ) as HTMLElement;
}

function rowButton(row: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(row.querySelectorAll("button")).find((b) => b.textContent === text);
}

function rowBadge(row: HTMLElement): HTMLElement | null {
  return row.querySelector(".badge");
}

function modalButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll(".modal-overlay button")).find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement | undefined;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("renderGroup tab control", () => {
  it("notifies the parent via onTabChange instead of switching internally", () => {
    const onTabChange = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, group(), actions({ onTabChange }), "expenses");

    const peopleTab = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "People",
    )!;
    peopleTab.click();

    expect(onTabChange).toHaveBeenCalledWith("people");
  });

  it("renders the tab passed in, so a live re-render preserves the active tab", () => {
    const container = document.createElement("div");
    // Simulate a snapshot re-render while the user is on the People tab.
    renderGroup(container, group(), actions(), "people");
    expect(container.textContent).toContain("Add a person");
    expect(container.textContent).not.toContain("Add expense");

    // And the settle tab when that is the active tab.
    renderGroup(container, group(), actions(), "settle");
    expect(container.textContent).toContain("Balances");
  });
});

describe("People tab: connect to a person", () => {
  it("shows a 'This is me' button on every person except the one already linked to you", () => {
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uA" }), "people");

    const alice = personRow(container, "Alice");
    expect(rowBadge(alice)?.textContent).toBe("You");
    expect(rowButton(alice, "This is me")).toBeUndefined();
    expect(rowButton(personRow(container, "Bob"), "This is me")).toBeTruthy();
    expect(rowButton(personRow(container, "Carol"), "This is me")).toBeTruthy();
  });

  it("shows a link-status badge on every person and a linked summary", () => {
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uA" }), "people");

    expect(rowBadge(personRow(container, "Alice"))?.textContent).toBe("You");
    expect(rowBadge(personRow(container, "Bob"))?.textContent).toBe("Not linked");
    expect(rowBadge(personRow(container, "Carol"))?.textContent).toBe("Linked");
    expect(container.textContent).toContain("2 of 3 linked");
  });

  it("opens a confirm modal and links the chosen person on confirm", () => {
    const linkPerson = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uX", linkPerson }), "people");

    rowButton(personRow(container, "Bob"), "This is me")!.click();
    expect(document.body.querySelector(".modal-overlay")).not.toBeNull();
    expect(linkPerson).not.toHaveBeenCalled(); // not until confirmed

    modalButton("This is me")!.click();
    expect(linkPerson).toHaveBeenCalledWith("b");
  });

  it("does not link when the modal is cancelled", () => {
    const linkPerson = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uX", linkPerson }), "people");

    rowButton(personRow(container, "Bob"), "This is me")!.click();
    modalButton("Cancel")!.click();
    expect(linkPerson).not.toHaveBeenCalled();
    expect(document.body.querySelector(".modal-overlay")).toBeNull();
  });

  it("warns in the modal when taking over a person already linked to another account", () => {
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uX" }), "people");

    rowButton(personRow(container, "Carol"), "This is me")!.click();
    expect(document.body.querySelector(".modal-overlay")?.textContent).toMatch(/already linked/i);
  });
});
