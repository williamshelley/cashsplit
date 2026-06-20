// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderSettle } from "../../src/ui/settle";
import type { Group, Person } from "../../src/types";

const people: Person[] = [
  { id: "a", name: "Alice", venmo: "alice-v", uid: "uA" },
  { id: "b", name: "Bob", venmo: null, uid: "uB" },
];

function group(over: Partial<Group> = {}): Group {
  return {
    name: "Trip",
    createdAt: 0,
    updatedAt: 0,
    ownerUid: "uA",
    memberUids: ["uA", "uB"],
    people,
    expenses: [
      {
        id: "e1",
        description: "Dinner",
        amount: 20,
        paidBy: "a",
        date: "2026-01-01",
        split: { method: "equal", participants: ["a", "b"], values: {} },
      },
    ],
    settlements: [],
    ...over,
  };
}

/**
 * Reversed scenario: Bob paid, so Alice owes Bob $10. Bob has no Venmo handle,
 * so the only transfer (a → b) has a creditor without a payable Venmo link.
 */
function aliceOwesBob(): Partial<Group> {
  return {
    expenses: [
      {
        id: "e2",
        description: "Cab",
        amount: 20,
        paidBy: "b",
        date: "2026-01-02",
        split: { method: "equal", participants: ["a", "b"], values: {} },
      },
    ],
  };
}

describe("renderSettle", () => {
  it("shows a Pay with Venmo link pre-filled with amount and note", () => {
    const container = document.createElement("div");
    renderSettle(container, group(), "uB", { onMarkPaid: vi.fn() });

    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.href).toContain("venmo.com/alice-v");
    expect(link.href).toContain("amount=10.00");
    expect(decodeURIComponent(link.href)).toContain("CashSplit: Trip");
  });

  it("calls onMarkPaid with the transfer when 'Mark paid' is clicked", () => {
    const onMarkPaid = vi.fn();
    const container = document.createElement("div");
    renderSettle(container, group(), "uB", { onMarkPaid });

    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      /mark paid/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();

    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    expect(onMarkPaid).toHaveBeenCalledWith(
      expect.objectContaining({ fromId: "b", toId: "a", amount: 10 }),
    );
  });

  it("does not record a duplicate settlement on a double-click", async () => {
    let release!: () => void;
    const onMarkPaid = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const container = document.createElement("div");
    renderSettle(container, group(), "uB", { onMarkPaid });

    const btn = Array.from(container.querySelectorAll("button")).find((b) =>
      /mark paid/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    btn.click();
    btn.click(); // second click while the first write is still in flight

    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    release();
  });

  it("shows an all-settled message when there is nothing to pay", () => {
    const container = document.createElement("div");
    renderSettle(container, group({ expenses: [] }), "uB", { onMarkPaid: vi.fn() });
    expect(/settled|all paid|nothing/i.test(container.textContent ?? "")).toBe(true);
  });

  it("hides the Pay with Venmo link on a row where the current user is not the debtor", () => {
    // Bob owes Alice $10; the logged-in user is Alice (the creditor), not the debtor.
    const container = document.createElement("div");
    renderSettle(container, group(), "uA", { onMarkPaid: vi.fn() });
    expect(container.querySelector("a")).toBeNull();
  });

  it("hides the Pay with Venmo link when the current user is not one of the group's people", () => {
    // uX is a viewer with no linked Person, so they owe no one — no pay link anywhere.
    const container = document.createElement("div");
    renderSettle(container, group(), "uX", { onMarkPaid: vi.fn() });
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows the add-Venmo hint on the current user's own debt row when the creditor has no Venmo", () => {
    // Alice owes Bob (who has no Venmo); logged in as Alice (the debtor).
    const container = document.createElement("div");
    renderSettle(container, group(aliceOwesBob()), "uA", { onMarkPaid: vi.fn() });
    expect(container.textContent).toContain("Add Bob's Venmo");
    expect(container.querySelector("a")).toBeNull();
  });

  it("hides the add-Venmo hint on a row where the current user is not the debtor", () => {
    // Alice owes Bob (no Venmo); logged in as Bob (the creditor) — not his debt to settle.
    const container = document.createElement("div");
    renderSettle(container, group(aliceOwesBob()), "uB", { onMarkPaid: vi.fn() });
    expect(container.textContent).not.toContain("Add Bob's Venmo");
  });
});
