/**
 * Normalize a Venmo handle: strip a leading "@" and surrounding whitespace.
 * Returns null for empty/blank input.
 */
export function normalizeHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const trimmed = handle.trim().replace(/^@+/, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface VenmoPayOptions {
  handle: string | null | undefined;
  amount: number;
  note: string;
}

/**
 * Build a Venmo payment deep link. On mobile this universal link opens the
 * Venmo app with the recipient and amount pre-filled; on desktop it opens
 * Venmo on the web.
 */
export function venmoPayLink({ handle, amount, note }: VenmoPayOptions): string {
  const h = normalizeHandle(handle);
  if (!h) {
    throw new Error("A Venmo handle is required to build a payment link.");
  }
  // Build the query manually so spaces encode as %20 (not "+"), which the
  // Venmo app deep link handles most reliably.
  const query = [
    `txn=pay`,
    `amount=${encodeURIComponent(amount.toFixed(2))}`,
    `note=${encodeURIComponent(note)}`,
  ].join("&");
  return `https://venmo.com/${encodeURIComponent(h)}?${query}`;
}
