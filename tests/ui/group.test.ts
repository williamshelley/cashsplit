// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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

function actions(over: Partial<GroupActions> = {}): GroupActions {
  return {
    currentUid: "uA",
    addPerson: vi.fn(),
    updatePerson: vi.fn(),
    removePerson: vi.fn(),
    addExpense: vi.fn(),
    removeExpense: vi.fn(),
    addSettlement: vi.fn(),
    onBack: vi.fn(),
    onCopyLink: vi.fn(),
    ...over,
  };
}

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
