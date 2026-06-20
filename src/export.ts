import { computeShares, round2 } from "./model";
import type { GroupDoc } from "./types";

/** Fixed leading columns of the expenses section, before the per-person columns. */
const EXPENSE_HEADER = ["Date", "Description", "Amount", "Paid By", "Split"];

/** Quote a CSV cell if it contains a comma, double quote, or newline. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Format a dollar amount as a bare 2-decimal number (no symbol, no separators). */
function money(n: number): string {
  return round2(n).toFixed(2);
}

/**
 * Render a group's expenses and settlements as a single CSV string with two
 * sections: an EXPENSES table (one row per expense, a column per person showing
 * that person's share, and a TOTAL row) and a SETTLEMENTS table.
 */
export function groupExpensesToCsv(group: GroupDoc): string {
  const people = group.people;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Unknown";

  const lines: string[] = [];

  // --- EXPENSES ---
  lines.push("--- EXPENSES ---");
  lines.push([...EXPENSE_HEADER, ...people.map((p) => p.name)].map(csvCell).join(","));

  const sorted = [...group.expenses].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.createdAt - b.createdAt;
  });

  const columnTotals: Record<string, number> = {};
  let amountTotal = 0;

  for (const e of sorted) {
    const shares = (() => {
      try {
        return computeShares(e, people);
      } catch {
        return {};
      }
    })();
    amountTotal += e.amount;
    const personCells = people.map((p) => {
      const share = shares[p.id];
      if (share === undefined) return "";
      columnTotals[p.id] = (columnTotals[p.id] ?? 0) + share;
      return money(share);
    });
    lines.push(
      [
        e.date,
        csvCell(e.description),
        money(e.amount),
        csvCell(nameOf(e.paidBy)),
        e.split.method,
        ...personCells,
      ].join(","),
    );
  }

  lines.push(
    ["TOTAL", "", money(amountTotal), "", "", ...people.map((p) => money(columnTotals[p.id] ?? 0))].join(","),
  );

  // --- SETTLEMENTS ---
  lines.push("");
  lines.push("--- SETTLEMENTS ---");
  lines.push("Date,From,To,Amount");
  const settlements = [...group.settlements].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (const s of settlements) {
    lines.push([s.date, csvCell(nameOf(s.from)), csvCell(nameOf(s.to)), money(s.amount)].join(","));
  }

  return lines.join("\n");
}

/** A safe, descriptive download filename for a group's CSV export. */
export function csvFilename(group: GroupDoc): string {
  const slug = group.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "group"}-expenses.csv`;
}

/** Trigger a browser download of `content` as a file named `filename`. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
