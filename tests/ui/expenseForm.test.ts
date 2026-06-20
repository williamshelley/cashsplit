// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderExpenseForm } from "../../src/ui/expenseForm";
import type { Expense, ExpenseInput, Person } from "../../src/types";

const people: Person[] = [
  { id: "a", name: "Alice", venmo: null, uid: null },
  { id: "b", name: "Bob", venmo: null, uid: null },
];

function setup(onSave: (e: ExpenseInput) => void | Promise<void>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderExpenseForm(container, people, { onSave, onCancel: vi.fn() });

  const desc = container.querySelector('input[type="text"]') as HTMLInputElement;
  desc.value = "Dinner";
  desc.dispatchEvent(new Event("input"));
  // The first number input is the amount field; later ones are per-person values.
  const amount = container.querySelector('input[type="number"]') as HTMLInputElement;
  amount.value = "20";
  amount.dispatchEvent(new Event("input"));

  const saveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
    /add expense/i.test(b.textContent ?? ""),
  ) as HTMLButtonElement;
  const form = container.querySelector("form") as HTMLFormElement;
  // The split method is a segmented control: one ".seg" button per method.
  const methodButton = (label: string) =>
    Array.from(container.querySelectorAll("button.seg")).find(
      (b) => b.textContent === label,
    ) as HTMLButtonElement;
  const valueInputs = () =>
    (Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[]).slice(1);
  return { container, saveBtn, form, methodButton, valueInputs };
}

const submit = (form: HTMLFormElement) =>
  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

describe("renderExpenseForm", () => {
  it("saves only once when submitted twice while the write is in flight", async () => {
    let release!: () => void;
    const onSave = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const { form, saveBtn } = setup(onSave);

    expect(saveBtn.disabled).toBe(false);
    submit(form);
    submit(form); // double-submit before the first save resolves

    expect(onSave).toHaveBeenCalledTimes(1);
    release();
  });

  it("resets per-person values when the split method changes", () => {
    const { methodButton, valueInputs } = setup(vi.fn());

    methodButton("Exact").click();
    const first = valueInputs()[0];
    first.value = "12.5";
    first.dispatchEvent(new Event("input"));

    // Switching the method must not carry dollar entries over as percentages/shares.
    methodButton("Percent").click();
    expect(valueInputs().every((i) => i.value === "")).toBe(true);
  });

  it("defaults the expense date to today in create mode", () => {
    const container = document.createElement("div");
    renderExpenseForm(container, people, { onSave: vi.fn(), onCancel: vi.fn() });
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(date).toBeTruthy();
    expect(date.value).toBe(new Date().toISOString().slice(0, 10));
  });

  it("prefills every field from an initial expense and saves edits keeping its id", async () => {
    const initial: Expense = {
      id: "e9",
      description: "Old dinner",
      amount: 40,
      paidBy: "b",
      date: "2026-03-03",
      split: { method: "exact", participants: ["a", "b"], values: { a: 10, b: 30 } },
      createdAt: 111,
      updatedAt: 222,
    };
    const onSave = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderExpenseForm(container, people, { onSave, onCancel: vi.fn() }, initial);

    // Heading + primary button are relabeled for editing.
    expect(container.querySelector("h3")?.textContent).toBe("Edit expense");
    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /save changes/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();

    // Every field is prefilled from the initial expense.
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("Old dinner");
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("40");
    expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2026-03-03");
    const paidBy = container.querySelector("select") as HTMLSelectElement; // first select is "Paid by"
    expect(paidBy.value).toBe("b");

    // Edit the date, then save.
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    date.value = "2026-04-04";
    date.dispatchEvent(new Event("input"));
    const form = container.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as ExpenseInput & Record<string, unknown>;
    expect(saved.id).toBe("e9"); // keeps the original id rather than minting a new one
    expect(saved.date).toBe("2026-04-04"); // edited date is carried through
    expect(saved.description).toBe("Old dinner");
    expect(saved.amount).toBe(40);
    expect(saved.paidBy).toBe("b");
    expect(saved.split.method).toBe("exact");
    expect("createdAt" in saved).toBe(false); // the form yields ExpenseInput; db owns timestamps
  });
});
