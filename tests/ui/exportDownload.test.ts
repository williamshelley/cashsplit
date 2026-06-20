// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadCsv } from "../../src/export";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadCsv", () => {
  it("builds a text/csv blob and clicks a download anchor with the given filename", () => {
    let blobType = "";
    const createObjectURL = vi.fn((blob: Blob) => {
      blobType = blob.type;
      return "blob:export-url";
    });
    const revokeObjectURL = vi.fn();
    // jsdom does not implement object URLs, so provide them.
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;

    let clickedDownload: string | null = null;
    let clickedHref: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedDownload = this.download;
      clickedHref = this.href;
    });

    downloadCsv("ski-trip-expenses.csv", "a,b\n1,2");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(blobType).toContain("text/csv");
    expect(clickedDownload).toBe("ski-trip-expenses.csv");
    expect(clickedHref).toContain("blob:export-url");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:export-url");
    // the temporary anchor should not linger in the document
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
