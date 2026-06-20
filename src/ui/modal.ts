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
