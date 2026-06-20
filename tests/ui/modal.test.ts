// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { confirmModal } from "../../src/ui/modal";

afterEach(() => {
  document.body.replaceChildren();
});

function overlay() {
  return document.body.querySelector(".modal-overlay") as HTMLElement | null;
}

function button(text: string) {
  return Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === text)!;
}

describe("confirmModal", () => {
  it("renders the title and message in an overlay with Confirm and Cancel", () => {
    confirmModal({ title: "Connect?", message: "Link to Bob", onConfirm: vi.fn() });
    expect(overlay()).not.toBeNull();
    expect(document.body.textContent).toContain("Connect?");
    expect(document.body.textContent).toContain("Link to Bob");
    expect(button("Cancel")).toBeTruthy();
    expect(button("Confirm")).toBeTruthy();
  });

  it("runs onConfirm and removes the overlay when confirmed", async () => {
    const onConfirm = vi.fn();
    confirmModal({ title: "T", message: "m", onConfirm });
    button("Confirm").click();
    await Promise.resolve();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(overlay()).toBeNull();
  });

  it("dismisses without calling onConfirm when cancelled", () => {
    const onConfirm = vi.fn();
    confirmModal({ title: "T", message: "m", onConfirm });
    button("Cancel").click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  });

  it("uses a custom confirm label when provided", () => {
    confirmModal({ title: "T", message: "m", confirmLabel: "This is me", onConfirm: vi.fn() });
    expect(button("This is me")).toBeTruthy();
  });
});
