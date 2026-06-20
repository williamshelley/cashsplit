// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderGroup, type GroupActions } from "../../src/ui/group";
import type { Expense, GroupDoc } from "../../src/types";

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    description: "Dinner",
    amount: 20,
    paidBy: "a",
    date: "2026-01-01",
    split: { method: "equal", participants: ["a"], values: {} },
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

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
    updateOwnVenmo: vi.fn(),
    updateOwnName: vi.fn(),
    linkPerson: vi.fn(),
    removePerson: vi.fn(),
    addExpense: vi.fn(),
    updateExpense: vi.fn(),
    removeExpense: vi.fn(),
    addSettlement: vi.fn(),
    removeSettlement: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
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

describe("Expenses tab: editing", () => {
  it("opens a prefilled edit form and saves via updateExpense, keeping the id", async () => {
    const updateExpense = vi.fn();
    const container = document.createElement("div");
    const g = { ...group(), expenses: [expense({ id: "e1", description: "Tacos", amount: 12 })] };
    renderGroup(container, g, actions({ updateExpense }), "expenses");

    const row = Array.from(container.querySelectorAll(".list-item")).find((r) =>
      r.textContent?.includes("Tacos"),
    ) as HTMLElement;
    const editBtn = rowButton(row, "Edit");
    expect(editBtn).toBeTruthy();
    editBtn!.click();

    // The shared form is now shown, prefilled and in edit mode.
    expect(container.querySelector("h3")?.textContent).toBe("Edit expense");
    const desc = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(desc.value).toBe("Tacos");

    // Change a field and save.
    desc.value = "Burritos";
    desc.dispatchEvent(new Event("input"));
    const form = container.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await Promise.resolve();

    expect(updateExpense).toHaveBeenCalledTimes(1);
    const saved = updateExpense.mock.calls[0][0];
    expect(saved.id).toBe("e1"); // edits the same expense rather than adding a new one
    expect(saved.description).toBe("Burritos");
  });

  it("marks a row as edited only when it was updated after creation", () => {
    const container = document.createElement("div");
    const g = {
      ...group(),
      expenses: [
        expense({ id: "e1", description: "Alpha", createdAt: 1000, updatedAt: 2000 }), // edited
        expense({ id: "e2", description: "Beta", createdAt: 1000, updatedAt: 1000 }), // untouched
      ],
    };
    renderGroup(container, g, actions(), "expenses");

    const rowFor = (name: string) =>
      Array.from(container.querySelectorAll(".list-item")).find((r) =>
        r.textContent?.includes(name),
      ) as HTMLElement;
    expect(rowFor("Alpha").textContent).toMatch(/edited/i);
    expect(rowFor("Beta").textContent).not.toMatch(/edited/i);
  });
});

describe("Expenses tab: layout", () => {
  it("wraps the add-expense button in a spacing bar so it isn't flush with the list", () => {
    const container = document.createElement("div");
    renderGroup(container, group(), actions(), "expenses");

    const addBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add expense",
    )!;
    expect(addBtn.closest(".expense-add-bar")).not.toBeNull();
  });
});

describe("Expenses tab: deleting requires confirmation", () => {
  function tacosGroup() {
    return { ...group(), expenses: [expense({ id: "e1", description: "Tacos" })] };
  }
  function tacosRow(container: HTMLElement) {
    return Array.from(container.querySelectorAll(".list-item")).find((r) =>
      r.textContent?.includes("Tacos"),
    ) as HTMLElement;
  }

  it("deletes the expense only after the confirm modal is accepted", () => {
    const removeExpense = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, tacosGroup(), actions({ removeExpense }), "expenses");

    rowButton(tacosRow(container), "Delete")!.click();
    expect(document.body.querySelector(".modal-overlay")).not.toBeNull();
    expect(removeExpense).not.toHaveBeenCalled(); // not until confirmed

    modalButton("Delete")!.click();
    expect(removeExpense).toHaveBeenCalledWith("e1");
  });

  it("does not delete the expense when the confirm modal is cancelled", () => {
    const removeExpense = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, tacosGroup(), actions({ removeExpense }), "expenses");

    rowButton(tacosRow(container), "Delete")!.click();
    modalButton("Cancel")!.click();

    expect(removeExpense).not.toHaveBeenCalled();
    expect(document.body.querySelector(".modal-overlay")).toBeNull();
  });
});

describe("People tab: removing a person requires confirmation", () => {
  it("removes the person only after the confirm modal is accepted", () => {
    const removePerson = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uA", removePerson }), "people");

    rowButton(personRow(container, "Bob"), "Remove")!.click();
    expect(document.body.querySelector(".modal-overlay")).not.toBeNull();
    expect(removePerson).not.toHaveBeenCalled(); // not until confirmed

    modalButton("Remove")!.click();
    expect(removePerson).toHaveBeenCalledWith("b");
  });

  it("does not remove the person when the confirm modal is cancelled", () => {
    const removePerson = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uA", removePerson }), "people");

    rowButton(personRow(container, "Bob"), "Remove")!.click();
    modalButton("Cancel")!.click();

    expect(removePerson).not.toHaveBeenCalled();
    expect(document.body.querySelector(".modal-overlay")).toBeNull();
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

describe("People tab: only a linked user can edit their own Venmo", () => {
  // Everyone has a handle so we can tell an editable input from read-only text.
  function withVenmos(): GroupDoc {
    return {
      ...multiGroup(),
      people: [
        { id: "a", name: "Alice", venmo: "alice-v", uid: "uA" },
        { id: "b", name: "Bob", venmo: "bob-v", uid: null },
        { id: "c", name: "Carol", venmo: "carol-v", uid: "uC" },
      ],
    };
  }

  it("renders an editable Venmo input only on the row linked to you", () => {
    const container = document.createElement("div");
    renderGroup(container, withVenmos(), actions({ currentUid: "uA" }), "people");

    // Your own row (Alice/uA): an editable input prefilled with your handle.
    const aliceInput = personRow(container, "Alice").querySelector("input");
    expect(aliceInput).toBeTruthy();
    expect((aliceInput as HTMLInputElement).value).toBe("@alice-v");

    // Everyone else: no input — the handle is shown read-only.
    expect(personRow(container, "Bob").querySelector("input")).toBeNull();
    expect(personRow(container, "Carol").querySelector("input")).toBeNull();
  });

  it("shows other people's Venmo as read-only text (still visible for paying them)", () => {
    const container = document.createElement("div");
    renderGroup(container, withVenmos(), actions({ currentUid: "uA" }), "people");

    expect(personRow(container, "Bob").textContent).toContain("@bob-v");
    expect(personRow(container, "Carol").textContent).toContain("@carol-v");
  });

  it("saves your own Venmo via updateOwnVenmo, stripping the leading @", async () => {
    const updateOwnVenmo = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, withVenmos(), actions({ currentUid: "uA", updateOwnVenmo }), "people");

    const input = personRow(container, "Alice").querySelector("input") as HTMLInputElement;
    input.value = "@alice2";
    input.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(updateOwnVenmo).toHaveBeenCalledWith("alice2");
  });

  it("shows no editable Venmo input at all when you are not linked to anyone", () => {
    const container = document.createElement("div");
    // currentUid uX is a member but not linked to any person.
    renderGroup(container, withVenmos(), actions({ currentUid: "uX" }), "people");

    for (const name of ["Alice", "Bob", "Carol"]) {
      expect(personRow(container, name).querySelector("input")).toBeNull();
    }
  });
});

describe("People tab: only a linked user can edit their own name", () => {
  function modalInput(): HTMLInputElement | null {
    return document.body.querySelector(".modal-overlay input");
  }

  it("offers an Edit button only on the row linked to you", () => {
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uA" }), "people");

    // Your own row (Alice/uA) can be renamed; nobody else's row can.
    expect(rowButton(personRow(container, "Alice"), "Edit")).toBeTruthy();
    expect(rowButton(personRow(container, "Bob"), "Edit")).toBeUndefined();
    expect(rowButton(personRow(container, "Carol"), "Edit")).toBeUndefined();
  });

  it("opens a prompt prefilled with your name and saves via updateOwnName", async () => {
    const updateOwnName = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uA", updateOwnName }), "people");

    rowButton(personRow(container, "Alice"), "Edit")!.click();

    // The prompt is prefilled with the current name.
    expect(modalInput()?.value).toBe("Alice");

    modalInput()!.value = "  Alicia  ";
    modalButton("Save")!.click();
    await Promise.resolve();

    // promptModal hands onSubmit the trimmed value.
    expect(updateOwnName).toHaveBeenCalledWith("Alicia");
  });

  it("offers no Edit button when you are not linked to anyone", () => {
    const container = document.createElement("div");
    // currentUid uX is a member but not linked to any person.
    renderGroup(container, multiGroup(), actions({ currentUid: "uX" }), "people");

    for (const name of ["Alice", "Bob", "Carol"]) {
      expect(rowButton(personRow(container, name), "Edit")).toBeUndefined();
    }
  });
});

describe("People tab: add-person form no longer sets Venmo", () => {
  it("offers only a name field (no Venmo) in the add form", () => {
    const container = document.createElement("div");
    renderGroup(container, group(), actions(), "people");

    const form = container.querySelector("form") as HTMLFormElement;
    const inputs = Array.from(form.querySelectorAll("input"));
    expect(inputs).toHaveLength(1);
    expect(inputs[0].placeholder).toMatch(/name/i);
    expect(inputs.some((i) => /venmo/i.test(i.placeholder))).toBe(false);
  });

  it("adds a person with no Venmo handle", async () => {
    const addPerson = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, group(), actions({ addPerson }), "people");

    const form = container.querySelector("form") as HTMLFormElement;
    const nameInput = form.querySelector("input") as HTMLInputElement;
    nameInput.value = "Dave";
    nameInput.dispatchEvent(new Event("input"));
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await Promise.resolve();

    expect(addPerson).toHaveBeenCalledTimes(1);
    expect(addPerson.mock.calls[0][0]).toMatchObject({ name: "Dave", venmo: null, uid: null });
  });
});

function tabLabels(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll(".tabs button")).map((b) => b.textContent);
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text) as
    | HTMLButtonElement
    | undefined;
}

describe("group tabs: Share replaced by Settings", () => {
  it("offers a Settings tab and no Share tab", () => {
    const container = document.createElement("div");
    renderGroup(container, group(), actions(), "expenses");
    expect(tabLabels(container)).toContain("Settings");
    expect(tabLabels(container)).not.toContain("Share");
  });
});

describe("People tab: invite section (moved from Share)", () => {
  it("shows an invite section with a copy button that calls onCopyLink", async () => {
    const onCopyLink = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, group(), actions({ onCopyLink }), "people");

    expect(container.textContent).toMatch(/invite/i);
    const copyBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /copy invite/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    expect(copyBtn).toBeTruthy();
    copyBtn.click();
    await Promise.resolve();
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });
});

describe("Settings tab", () => {
  it("renames the group via a prompt prefilled with the current name", async () => {
    const renameGroup = vi.fn();
    const container = document.createElement("div");
    renderGroup(container, group(), actions({ renameGroup }), "settings");

    findButton(container, "Rename")!.click();
    const input = document.body.querySelector(".modal-overlay input") as HTMLInputElement;
    expect(input.value).toBe("Tahoe Ski Trip");

    input.value = "  Tahoe 2026  ";
    modalButton("Save")!.click();
    await Promise.resolve();

    expect(renameGroup).toHaveBeenCalledWith("Tahoe 2026"); // trimmed
  });

  it("lets the owner delete the group only after confirming", () => {
    const deleteGroup = vi.fn();
    const container = document.createElement("div");
    // Default currentUid uA is the group owner.
    renderGroup(container, group(), actions({ deleteGroup }), "settings");

    findButton(container, "Delete group")!.click();
    expect(document.body.querySelector(".modal-overlay")).not.toBeNull();
    expect(deleteGroup).not.toHaveBeenCalled();

    modalButton("Delete")!.click();
    expect(deleteGroup).toHaveBeenCalledTimes(1);
  });

  it("hides the delete control from non-owners", () => {
    const container = document.createElement("div");
    // uX is a member but not the owner (ownerUid is uA).
    renderGroup(container, multiGroup(), actions({ currentUid: "uX" }), "settings");
    expect(findButton(container, "Delete group")).toBeUndefined();
  });
});
