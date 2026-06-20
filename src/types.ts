export type SplitMethod = "equal" | "exact" | "percent" | "shares";

export interface Person {
  id: string;
  name: string;
  /** Venmo username/handle without the leading "@", or null if not set. */
  venmo: string | null;
  /** Linked authenticated account uid, or null for an offline/name-only person. */
  uid: string | null;
}

export interface Split {
  method: SplitMethod;
  /** Person ids that this expense is split among. */
  participants: string[];
  /**
   * Per-person value keyed by Person.id. Interpretation depends on method:
   * - "equal":   ignored
   * - "exact":   dollar amount owed by that person
   * - "percent": percentage (0-100) of the total owed by that person
   * - "shares":  relative weight (any positive number)
   */
  values: Record<string, number>;
}

export interface Expense {
  id: string;
  description: string;
  /** Total amount of the expense, in dollars. */
  amount: number;
  /** Person.id of who paid. */
  paidBy: string;
  /** ISO date string (the date the expense occurred; user-editable). */
  date: string;
  split: Split;
  /** Epoch ms when the expense was first created. */
  createdAt: number;
  /** Epoch ms when the expense was last edited (equals createdAt when unedited). */
  updatedAt: number;
}

/**
 * The user-supplied fields of an expense. `createdAt`/`updatedAt` are bookkeeping
 * timestamps owned by the data layer (db.ts), so callers never set them.
 */
export type ExpenseInput = Omit<Expense, "createdAt" | "updatedAt">;

export interface Settlement {
  id: string;
  /** Person.id paying. */
  from: string;
  /** Person.id receiving. */
  to: string;
  amount: number;
  date: string;
}

export interface Group {
  name: string;
  createdAt: number;
  updatedAt: number;
  ownerUid: string;
  memberUids: string[];
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
}

/** A group as stored in Firestore plus its document id. */
export interface GroupDoc extends Group {
  id: string;
}

/** Net balance for a person: positive => owed money, negative => owes money. */
export interface Balance {
  personId: string;
  amount: number;
}

/** A suggested payment from a debtor to a creditor. */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}
