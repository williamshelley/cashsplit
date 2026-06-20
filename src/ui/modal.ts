import { el } from "./dom";

type Content = Node | string | null;

export interface ConfirmOptions {
  title: string;
  /** Body content: a string, a Node, or a mix of them. */
  message: Content | Content[];
  /** Label for the confirm button (default "Confirm"). */
  confirmLabel?: string;
  /** Label for the cancel button (default "Cancel"). */
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  /** Called when the user confirms; the modal closes once it resolves. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Show a modal asking the user to confirm an action. Confirm runs `onConfirm`
 * then dismisses; Cancel, Escape, and a backdrop click dismiss without acting.
 */
export function confirmModal(opts: ConfirmOptions): void {
  const messages = Array.isArray(opts.message) ? opts.message : [opts.message];

  const overlay = el("div", { class: "modal-overlay" });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };

  const confirmBtn = el(
    "button",
    {
      class: opts.danger ? "btn danger" : "btn primary",
      onClick: async () => {
        confirmBtn.disabled = true;
        try {
          await opts.onConfirm();
        } finally {
          close();
        }
      },
    },
    opts.confirmLabel ?? "Confirm",
  );

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.append(
    el("div", { class: "card stack modal" }, [
      el("h3", {}, opts.title),
      el("div", {}, messages),
      el("div", { class: "row" }, [
        el("button", { class: "btn", onClick: close }, opts.cancelLabel ?? "Cancel"),
        confirmBtn,
      ]),
    ]),
  );

  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
}

export interface PromptOptions {
  title: string;
  /** Optional hint shown above the input. */
  label?: string;
  /** Value the input starts with (e.g. the current name being edited). */
  initialValue?: string;
  /** Placeholder shown when the input is empty. */
  placeholder?: string;
  /** Label for the submit button (default "Save"). */
  confirmLabel?: string;
  /** Label for the cancel button (default "Cancel"). */
  cancelLabel?: string;
  /**
   * Called with the trimmed input value when submitted; the modal closes once it
   * resolves. A blank value is rejected without calling this.
   */
  onSubmit: (value: string) => void | Promise<void>;
}

/**
 * Show a modal prompting for a single line of text. Submit (button or Enter)
 * runs `onSubmit` with the trimmed value then dismisses; a blank value is
 * rejected. Cancel, Escape, and a backdrop click dismiss without acting.
 */
export function promptModal(opts: PromptOptions): void {
  const overlay = el("div", { class: "modal-overlay" });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };

  const field = el("input", {
    type: "text",
    value: opts.initialValue ?? "",
    placeholder: opts.placeholder ?? "",
    onKeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === "Enter") submit();
    },
  });

  const submit = async () => {
    const value = field.value.trim();
    if (!value) {
      field.focus();
      return;
    }
    submitBtn.disabled = true;
    try {
      await opts.onSubmit(value);
    } finally {
      close();
    }
  };

  const submitBtn = el("button", { class: "btn primary", onClick: submit }, opts.confirmLabel ?? "Save");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  overlay.append(
    el("div", { class: "card stack modal" }, [
      el("h3", {}, opts.title),
      opts.label ? el("label", { class: "hint" }, opts.label) : null,
      field,
      el("div", { class: "row" }, [
        el("button", { class: "btn", onClick: close }, opts.cancelLabel ?? "Cancel"),
        submitBtn,
      ]),
    ]),
  );

  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  field.focus();
  field.select();
}
