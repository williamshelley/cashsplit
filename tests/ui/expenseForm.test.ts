// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderExpenseForm } from "../../src/ui/expenseForm";
import type { Expense, Person } from "../../src/types";

const people: Person[] = [
  { id: "a", name: "Alice", venmo: null, uid: null },
  { id: "b", name: "Bob", venmo: null, uid: null },
];

function setup(onSave: (e: Expense) => void | Promise<void>) {
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
  const methodSelect = Array.from(container.querySelectorAll("select")).find((s) =>
    /Exact amounts/.test(s.textContent ?? ""),
  ) as HTMLSelectElement;
  const valueInputs = () =>
    (Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[]).slice(1);
  return { container, saveBtn, form, methodSelect, valueInputs };
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
    const { methodSelect, valueInputs } = setup(vi.fn());

    methodSelect.value = "exact";
    methodSelect.dispatchEvent(new Event("change"));
    const first = valueInputs()[0];
    first.value = "12.5";
    first.dispatchEvent(new Event("input"));

    // Switching the method must not carry dollar entries over as percentages/shares.
    methodSelect.value = "percent";
    methodSelect.dispatchEvent(new Event("change"));
    expect(valueInputs().every((i) => i.value === "")).toBe(true);
  });
});
