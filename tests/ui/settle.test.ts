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

describe("renderSettle", () => {
  it("shows a Pay with Venmo link pre-filled with amount and note", () => {
    const container = document.createElement("div");
    renderSettle(container, group(), { onMarkPaid: vi.fn() });

    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.href).toContain("venmo.com/alice-v");
    expect(link.href).toContain("amount=10.00");
    expect(decodeURIComponent(link.href)).toContain("CashSplit: Trip");
  });

  it("calls onMarkPaid with the transfer when 'Mark paid' is clicked", () => {
    const onMarkPaid = vi.fn();
    const container = document.createElement("div");
    renderSettle(container, group(), { onMarkPaid });

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
    renderSettle(container, group(), { onMarkPaid });

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
    renderSettle(container, group({ expenses: [] }), { onMarkPaid: vi.fn() });
    expect(/settled|all paid|nothing/i.test(container.textContent ?? "")).toBe(true);
  });
});
