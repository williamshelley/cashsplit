// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { confirmModal, promptModal } from "../../src/ui/modal";

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

function input() {
  return document.body.querySelector(".modal-overlay input") as HTMLInputElement | null;
}

describe("promptModal", () => {
  it("renders the title, an input prefilled with initialValue, and Save/Cancel", () => {
    promptModal({ title: "Edit your name", initialValue: "Alice", onSubmit: vi.fn() });
    expect(overlay()).not.toBeNull();
    expect(document.body.textContent).toContain("Edit your name");
    expect(input()?.value).toBe("Alice");
    expect(button("Cancel")).toBeTruthy();
    expect(button("Save")).toBeTruthy();
  });

  it("submits the trimmed value and dismisses on Save", async () => {
    const onSubmit = vi.fn();
    promptModal({ title: "T", initialValue: "Alice", onSubmit });
    input()!.value = "  Alicia  ";
    button("Save").click();
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledWith("Alicia");
    expect(overlay()).toBeNull();
  });

  it("submits on Enter within the input", async () => {
    const onSubmit = vi.fn();
    promptModal({ title: "T", initialValue: "Alice", onSubmit });
    const field = input()!;
    field.value = "Bob";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledWith("Bob");
    expect(overlay()).toBeNull();
  });

  it("does not submit a blank / whitespace-only value and stays open", () => {
    const onSubmit = vi.fn();
    promptModal({ title: "T", initialValue: "Alice", onSubmit });
    input()!.value = "   ";
    button("Save").click();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(overlay()).not.toBeNull();
  });

  it("dismisses without submitting when cancelled", () => {
    const onSubmit = vi.fn();
    promptModal({ title: "T", initialValue: "Alice", onSubmit });
    button("Cancel").click();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  });

  it("dismisses without submitting when Escape is pressed", () => {
    const onSubmit = vi.fn();
    promptModal({ title: "T", initialValue: "Alice", onSubmit });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  });

  it("uses a custom confirm label when provided", () => {
    promptModal({ title: "T", confirmLabel: "Rename", onSubmit: vi.fn() });
    expect(button("Rename")).toBeTruthy();
  });
});
