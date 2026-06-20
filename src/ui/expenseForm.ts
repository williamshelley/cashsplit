import { el, mount } from "./dom";
import { splitPreview, formatMoney } from "./viewmodel";
import { genId } from "../db";
import type { Expense, ExpenseInput, Person, Split, SplitMethod } from "../types";

export interface ExpenseFormHandlers {
  onSave: (expense: ExpenseInput) => void | Promise<void>;
  onCancel: () => void;
}

const METHOD_LABELS: Record<SplitMethod, string> = {
  equal: "Split equally",
  exact: "Exact amounts",
  percent: "Percentages",
  shares: "Shares / weights",
};

/**
 * Render the expense form with a live, reconciling split preview. Pass `initial`
 * to edit an existing expense (prefills every field and keeps its id); omit it to
 * create a new one.
 */
export function renderExpenseForm(
  container: HTMLElement,
  people: Person[],
  handlers: ExpenseFormHandlers,
  initial?: Expense,
): void {
  const isEdit = initial != null;
  const today = new Date().toISOString().slice(0, 10);
  const state = {
    description: initial?.description ?? "",
    amount: initial?.amount ?? 0,
    paidBy: initial?.paidBy ?? people[0]?.id ?? "",
    method: initial?.split.method ?? ("equal" as SplitMethod),
    participants: new Set(initial ? initial.split.participants : people.map((p) => p.id)),
    values: { ...(initial?.split.values ?? {}) } as Record<string, number>,
    date: initial?.date ?? today,
  };

  const previewBox = el("div", { class: "preview" });
  const saveBtn = el(
    "button",
    { class: "btn primary", type: "submit" },
    isEdit ? "Save changes" : "Add expense",
  );

  const currentSplit = (): Split => ({
    method: state.method,
    participants: people.filter((p) => state.participants.has(p.id)).map((p) => p.id),
    values: state.values,
  });

  const refreshPreview = () => {
    const pv = splitPreview(currentSplit(), state.amount, people);
    const rows = pv.rows.map((r) =>
      el("div", { class: "pv-row" }, [el("span", {}, r.name), el("span", {}, formatMoney(r.amount))]),
    );
    const total = pv.rows.reduce((s, r) => s + r.amount, 0);
    mount(
      previewBox,
      ...rows,
      el("div", { class: "pv-row pv-total" }, [
        el("span", {}, "Total split"),
        el("span", {}, `${formatMoney(total)} / ${formatMoney(state.amount)}`),
      ]),
      pv.valid ? null : el("div", { class: "error" }, pv.message ?? "Split is invalid."),
    );
    if (pv.valid && state.description.trim() && state.amount > 0) saveBtn.removeAttribute("disabled");
    else saveBtn.setAttribute("disabled", "true");
  };

  const valueInputs = el("div", { class: "stack" });
  const renderValueInputs = () => {
    if (state.method === "equal") {
      mount(valueInputs);
      return;
    }
    const unit = state.method === "percent" ? "%" : state.method === "shares" ? "shares" : "$";
    const inputs = people
      .filter((p) => state.participants.has(p.id))
      .map((p) =>
        el("div", { class: "row" }, [
          el("span", { style: "flex:1" }, p.name),
          el("input", {
            type: "number",
            step: "0.01",
            min: "0",
            style: "max-width:120px",
            value: state.values[p.id] != null ? String(state.values[p.id]) : "",
            placeholder: unit,
            onInput: (e: Event) => {
              state.values[p.id] = Number((e.target as HTMLInputElement).value) || 0;
              refreshPreview();
            },
          }),
        ]),
      );
    mount(valueInputs, ...inputs);
  };

  const participantChecks = el(
    "div",
    { class: "checks" },
    people.map((p) =>
      el("label", {}, [
        el("input", {
          type: "checkbox",
          checked: state.participants.has(p.id),
          onChange: (e: Event) => {
            if ((e.target as HTMLInputElement).checked) state.participants.add(p.id);
            else state.participants.delete(p.id);
            renderValueInputs();
            refreshPreview();
          },
        }),
        p.name,
      ]),
    ),
  );

  const methodSelect = el(
    "select",
    {
      onChange: (e: Event) => {
        state.method = (e.target as HTMLSelectElement).value as SplitMethod;
        // Entered values mean different things per method (dollars vs percent vs
        // shares); clear them so a switch can't silently reinterpret them.
        state.values = {};
        renderValueInputs();
        refreshPreview();
      },
    },
    (Object.keys(METHOD_LABELS) as SplitMethod[]).map((m) =>
      el("option", { value: m, selected: m === state.method }, METHOD_LABELS[m]),
    ),
  );

  const paidBySelect = el(
    "select",
    { onChange: (e: Event) => { state.paidBy = (e.target as HTMLSelectElement).value; } },
    people.map((p) => el("option", { value: p.id, selected: p.id === state.paidBy }, p.name)),
  );

  let submitting = false;
  const onSubmit = async (e: Event) => {
    e.preventDefault();
    if (submitting) return; // guard against double-submit while the write is in flight
    submitting = true;
    saveBtn.setAttribute("disabled", "true");
    const split = currentSplit();
    const expense: ExpenseInput = {
      id: initial?.id ?? genId(),
      description: state.description.trim(),
      amount: state.amount,
      paidBy: state.paidBy,
      date: state.date,
      split,
    };
    try {
      await handlers.onSave(expense);
    } catch (err) {
      submitting = false;
      saveBtn.removeAttribute("disabled");
      throw err;
    }
  };

  const form = el("form", { class: "stack", onSubmit }, [
    el("label", {}, "Description"),
    el("input", {
      type: "text",
      placeholder: "e.g. Dinner at Luigi's",
      value: state.description,
      onInput: (e: Event) => { state.description = (e.target as HTMLInputElement).value; refreshPreview(); },
    }),
    el("label", {}, "Amount ($)"),
    el("input", {
      type: "number", step: "0.01", min: "0", placeholder: "0.00",
      value: state.amount > 0 ? String(state.amount) : "",
      onInput: (e: Event) => { state.amount = Number((e.target as HTMLInputElement).value) || 0; refreshPreview(); },
    }),
    el("label", {}, "Date"),
    el("input", {
      type: "date",
      value: state.date,
      onInput: (e: Event) => { state.date = (e.target as HTMLInputElement).value; },
    }),
    el("label", {}, "Paid by"),
    paidBySelect,
    el("label", {}, "Split between"),
    participantChecks,
    el("label", {}, "How to split"),
    methodSelect,
    valueInputs,
    previewBox,
    el("div", { class: "row" }, [
      saveBtn,
      el("button", { class: "btn", type: "button", onClick: () => handlers.onCancel() }, "Cancel"),
    ]),
  ]);

  mount(
    container,
    el("div", { class: "card" }, [el("h3", {}, isEdit ? "Edit expense" : "Add expense"), form]),
  );
  renderValueInputs();
  refreshPreview();
}
