// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderSettle, type SettleHandlers } from "../../src/ui/settle";
import type { Group, Person } from "../../src/types";

function handlers(over: Partial<SettleHandlers> = {}): SettleHandlers {
  return { onMarkPaid: vi.fn(), onUnmarkPaid: vi.fn(), ...over };
}

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
        createdAt: 0,
        updatedAt: 0,
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
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  };
}

describe("renderSettle", () => {
  it("shows a single name → name arrow with no redundant avatar arrow", () => {
    // Bob owes Alice $10. The row should read "Bob → Alice" once, with no
    // avatar-to-avatar arrow duplicating it.
    const container = document.createElement("div");
    renderSettle(container, group(), "uA", handlers());

    const row = container.querySelector(".settle-row") as HTMLElement;
    expect(row.querySelectorAll(".avatar")).toHaveLength(0);
    const desc = row.querySelector(".settle-desc") as HTMLElement;
    expect(desc.textContent).toBe("Bob → Alice");
  });

  it("shows a Pay with Venmo link pre-filled with amount and note", () => {
    const container = document.createElement("div");
    renderSettle(container, group(), "uB", handlers());

    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.href).toContain("venmo.com/alice-v");
    expect(link.href).toContain("amount=10.00");
    expect(decodeURIComponent(link.href)).toContain("CashSplit: Trip");
  });

  it("calls onMarkPaid with the transfer when the creditor ticks the Mark-paid box", () => {
    // Bob owes Alice, so Alice is the creditor — only she may mark it paid.
    const onMarkPaid = vi.fn();
    const container = document.createElement("div");
    renderSettle(container, group(), "uA", handlers({ onMarkPaid }));

    const box = container.querySelector(".settle-row input[type=checkbox]") as HTMLInputElement;
    expect(box).toBeTruthy();
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event("change"));

    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    expect(onMarkPaid).toHaveBeenCalledWith(
      expect.objectContaining({ fromId: "b", toId: "a", amount: 10 }),
    );
  });

  it("does not record a duplicate settlement when the box is toggled twice mid-write", async () => {
    let release!: () => void;
    const onMarkPaid = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const container = document.createElement("div");
    // Logged in as Alice, the creditor, so the Mark-paid box is shown.
    renderSettle(container, group(), "uA", handlers({ onMarkPaid }));

    const box = container.querySelector(".settle-row input[type=checkbox]") as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    box.dispatchEvent(new Event("change")); // toggled again while the first write is in flight

    expect(onMarkPaid).toHaveBeenCalledTimes(1);
    release();
  });

  it("offers no Mark-paid box on a row where the current user is not the creditor", () => {
    // Bob owes Alice; logged in as Bob (the debtor). Only the creditor (Alice)
    // may confirm payment, so Bob sees no Mark-paid checkbox.
    const container = document.createElement("div");
    renderSettle(container, group(), "uB", handlers());
    expect(container.querySelector(".settle-row input[type=checkbox]")).toBeNull();
  });

  it("offers no Mark-paid box when the creditor is a name-only person", () => {
    // Carol (no linked account) is owed by Dave. Even Dave, the logged-in
    // debtor, cannot mark it paid — only the (absent) creditor could, so the
    // debt stays open until Carol joins and links her identity.
    const nameOnly: Person[] = [
      { id: "c", name: "Carol", venmo: null, uid: null },
      { id: "d", name: "Dave", venmo: null, uid: "uD" },
    ];
    const g = group({
      people: nameOnly,
      memberUids: ["uD"],
      expenses: [
        {
          id: "e3",
          description: "Gas",
          amount: 20,
          paidBy: "c",
          date: "2026-01-03",
          split: { method: "equal", participants: ["c", "d"], values: {} },
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    const container = document.createElement("div");
    renderSettle(container, g, "uD", handlers());
    expect(container.querySelector(".settle-row input[type=checkbox]")).toBeNull();
  });

  it("shows an all-settled message when there is nothing to pay", () => {
    const container = document.createElement("div");
    renderSettle(container, group({ expenses: [] }), "uB", handlers());
    expect(/settled|all paid|nothing/i.test(container.textContent ?? "")).toBe(true);
  });

  it("hides the Pay with Venmo link on a row where the current user is not the debtor", () => {
    // Bob owes Alice $10; the logged-in user is Alice (the creditor), not the debtor.
    const container = document.createElement("div");
    renderSettle(container, group(), "uA", handlers());
    expect(container.querySelector("a")).toBeNull();
  });

  it("hides the Pay with Venmo link when the current user is not one of the group's people", () => {
    // uX is a viewer with no linked Person, so they owe no one — no pay link anywhere.
    const container = document.createElement("div");
    renderSettle(container, group(), "uX", handlers());
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows the add-Venmo hint on the current user's own debt row when the creditor has no Venmo", () => {
    // Alice owes Bob (who has no Venmo); logged in as Alice (the debtor).
    const container = document.createElement("div");
    renderSettle(container, group(aliceOwesBob()), "uA", handlers());
    expect(container.textContent).toContain("Add Bob's Venmo");
    expect(container.querySelector("a")).toBeNull();
  });

  it("hides the add-Venmo hint on a row where the current user is not the debtor", () => {
    // Alice owes Bob (no Venmo); logged in as Bob (the creditor) — not his debt to settle.
    const container = document.createElement("div");
    renderSettle(container, group(aliceOwesBob()), "uB", handlers());
    expect(container.textContent).not.toContain("Add Bob's Venmo");
  });
});

describe("renderSettle — recorded payments", () => {
  // Bob already paid Alice the $10 he owed: the Dinner debt and this settlement
  // net to zero, so there are no open transfers — only one recorded payment.
  function settled(): Partial<Group> {
    return { settlements: [{ id: "s1", from: "b", to: "a", amount: 10, date: "2026-01-05" }] };
  }

  it("lists a recorded payment as a ticked box the creditor can untick to undo", () => {
    const onUnmarkPaid = vi.fn();
    const container = document.createElement("div");
    // Logged in as Alice (uA), the creditor of the recorded payment.
    renderSettle(container, group(settled()), "uA", handlers({ onUnmarkPaid }));

    const box = container.querySelector(".payment-row input[type=checkbox]") as HTMLInputElement;
    expect(box).toBeTruthy();
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new Event("change"));

    expect(onUnmarkPaid).toHaveBeenCalledTimes(1);
    expect(onUnmarkPaid).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", toId: "a", amount: 10 }));
  });

  it("shows a recorded payment as read-only to someone who is not the creditor", () => {
    const container = document.createElement("div");
    // Logged in as Bob (uB), the debtor who paid — he can't undo Alice's confirmation.
    renderSettle(container, group(settled()), "uB", handlers());

    const row = container.querySelector(".payment-row") as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.querySelector("input[type=checkbox]")).toBeNull();
    expect(row.textContent).toMatch(/paid/i);
  });
});
