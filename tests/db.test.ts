import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import {
  createGroup,
  joinGroup,
  addPerson,
  linkPersonToUser,
  updateOwnVenmo,
  updateOwnName,
  removePerson,
  addExpense,
  updateExpense,
  removeExpense,
  addSettlement,
  subscribeGroup,
  subscribeMyGroups,
  renameGroup,
} from "../src/db";
import type { ExpenseInput, GroupDoc, Person, Settlement } from "../src/types";

let testEnv: RulesTestEnvironment;
let db: Firestore;

// This suite verifies the data-access logic in db.ts (field names, array
// mutations, queries, subscriptions). Security rules are covered separately in
// rules.test.ts, so here we use open rules and a persistent client.
const OPEN_RULES = `rules_version='2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}`;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "cashsplit-db",
    firestore: { rules: OPEN_RULES },
  });
  db = testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const person = (over: Partial<Person> = {}): Person => ({
  id: "p1",
  name: "Alice",
  venmo: null,
  uid: null,
  ...over,
});

const expense = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  id: "e1",
  description: "Dinner",
  amount: 30,
  paidBy: "p1",
  date: "2026-01-01",
  split: { method: "equal", participants: ["p1"], values: {} },
  ...over,
});

async function read(id: string): Promise<GroupDoc> {
  const snap = await getDoc(doc(db, "groups", id));
  return { id, ...(snap.data() as Omit<GroupDoc, "id">) };
}

describe("createGroup", () => {
  it("creates a group with the owner as the first member and person", async () => {
    const id = await createGroup(db, {
      name: "Trip",
      ownerUid: "uA",
      ownerName: "Alice",
      ownerVenmo: "alice-v",
    });
    const g = await read(id);
    expect(g.name).toBe("Trip");
    expect(g.ownerUid).toBe("uA");
    expect(g.memberUids).toEqual(["uA"]);
    expect(g.people).toHaveLength(1);
    expect(g.people[0]).toMatchObject({ name: "Alice", venmo: "alice-v", uid: "uA" });
  });
});

describe("membership + people", () => {
  it("joinGroup adds a uid without duplicating", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await joinGroup(db, id, "uB");
    await joinGroup(db, id, "uB"); // idempotent
    expect((await read(id)).memberUids.sort()).toEqual(["uA", "uB"]);
  });

  it("addPerson and removePerson mutate the people list", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await addPerson(db, id, person({ id: "p2", name: "Bob" }));
    expect((await read(id)).people.map((p) => p.name)).toContain("Bob");
    await removePerson(db, id, "p2");
    expect((await read(id)).people.map((p) => p.name)).not.toContain("Bob");
  });

  it("linkPersonToUser links the caller to an unlinked person", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await addPerson(db, id, person({ id: "p2", name: "Bob", uid: null }));
    await linkPersonToUser(db, id, "p2", "uB");
    const people = (await read(id)).people;
    expect(people.find((p) => p.id === "p2")?.uid).toBe("uB");
  });

  it("linkPersonToUser clears the caller's uid from any other person (move/takeover)", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    // uB is currently linked to Bob; takes over Carol (already linked to uC).
    await addPerson(db, id, person({ id: "p2", name: "Bob", uid: "uB" }));
    await addPerson(db, id, person({ id: "p3", name: "Carol", uid: "uC" }));
    await linkPersonToUser(db, id, "p3", "uB");
    const people = (await read(id)).people;
    expect(people.find((p) => p.id === "p3")?.uid).toBe("uB"); // moved to Carol
    expect(people.find((p) => p.id === "p2")?.uid).toBe(null); // unlinked from Bob
  });
});

describe("updateOwnVenmo", () => {
  it("updates the Venmo of the person linked to the given uid", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "Alice" });
    await addPerson(db, id, person({ id: "p2", name: "Bob", uid: "uB", venmo: "old-bob" }));
    await updateOwnVenmo(db, id, "uB", "new-bob");
    expect((await read(id)).people.find((p) => p.uid === "uB")?.venmo).toBe("new-bob");
  });

  it("changes only the caller's own person, never anyone else's handle", async () => {
    const id = await createGroup(db, {
      name: "T",
      ownerUid: "uA",
      ownerName: "Alice",
      ownerVenmo: "alice-v",
    });
    await addPerson(db, id, person({ id: "p2", name: "Bob", uid: "uB", venmo: "bob-v" }));
    await updateOwnVenmo(db, id, "uA", "alice-new");
    const people = (await read(id)).people;
    expect(people.find((p) => p.uid === "uA")?.venmo).toBe("alice-new");
    expect(people.find((p) => p.uid === "uB")?.venmo).toBe("bob-v"); // untouched
  });

  it("clears the handle when given null", async () => {
    const id = await createGroup(db, {
      name: "T",
      ownerUid: "uA",
      ownerName: "Alice",
      ownerVenmo: "alice-v",
    });
    await updateOwnVenmo(db, id, "uA", null);
    expect((await read(id)).people.find((p) => p.uid === "uA")?.venmo).toBe(null);
  });

  it("is a safe no-op when no person is linked to the uid", async () => {
    const id = await createGroup(db, {
      name: "T",
      ownerUid: "uA",
      ownerName: "Alice",
      ownerVenmo: "alice-v",
    });
    await updateOwnVenmo(db, id, "uGhost", "ghost-v");
    const people = (await read(id)).people;
    expect(people.find((p) => p.uid === "uA")?.venmo).toBe("alice-v"); // untouched
    expect(people.some((p) => p.venmo === "ghost-v")).toBe(false);
  });
});

describe("updateOwnName", () => {
  it("updates the name of the person linked to the given uid", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "Alice" });
    await addPerson(db, id, person({ id: "p2", name: "Bob", uid: "uB" }));
    await updateOwnName(db, id, "uB", "Bobby");
    expect((await read(id)).people.find((p) => p.uid === "uB")?.name).toBe("Bobby");
  });

  it("changes only the caller's own person, never anyone else's name", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "Alice" });
    await addPerson(db, id, person({ id: "p2", name: "Bob", uid: "uB" }));
    await updateOwnName(db, id, "uA", "Alicia");
    const people = (await read(id)).people;
    expect(people.find((p) => p.uid === "uA")?.name).toBe("Alicia");
    expect(people.find((p) => p.uid === "uB")?.name).toBe("Bob"); // untouched
  });

  it("trims surrounding whitespace from the saved name", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "Alice" });
    await updateOwnName(db, id, "uA", "  Alicia  ");
    expect((await read(id)).people.find((p) => p.uid === "uA")?.name).toBe("Alicia");
  });

  it("ignores a blank / whitespace-only name (a name is required)", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "Alice" });
    await updateOwnName(db, id, "uA", "   ");
    expect((await read(id)).people.find((p) => p.uid === "uA")?.name).toBe("Alice"); // untouched
  });

  it("is a safe no-op when no person is linked to the uid", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "Alice" });
    await updateOwnName(db, id, "uGhost", "Ghost");
    const people = (await read(id)).people;
    expect(people.find((p) => p.uid === "uA")?.name).toBe("Alice"); // untouched
    expect(people.some((p) => p.name === "Ghost")).toBe(false);
  });
});

describe("expenses + settlements", () => {
  it("addExpense and removeExpense work", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await addExpense(db, id, expense({ id: "x", description: "Tacos" }));
    expect((await read(id)).expenses.map((e) => e.description)).toContain("Tacos");
    await removeExpense(db, id, "x");
    expect((await read(id)).expenses).toHaveLength(0);
  });

  it("addExpense stamps createdAt and updatedAt", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await addExpense(db, id, expense({ id: "x" }));
    const [e] = (await read(id)).expenses;
    expect(typeof e.createdAt).toBe("number");
    expect(typeof e.updatedAt).toBe("number");
    expect(e.createdAt).toBe(e.updatedAt); // a brand-new expense is unedited
  });

  it("updateExpense edits fields, preserves createdAt, and bumps updatedAt", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await addExpense(db, id, expense({ id: "x", description: "Tacos", amount: 30 }));
    const before = (await read(id)).expenses.find((e) => e.id === "x")!;

    await new Promise((r) => setTimeout(r, 20)); // ensure the clock advances a tick
    await updateExpense(
      db,
      id,
      expense({
        id: "x",
        description: "Burritos",
        amount: 42,
        date: "2026-02-02",
        split: { method: "exact", participants: ["p1"], values: { p1: 42 } },
      }),
    );

    const after = (await read(id)).expenses.find((e) => e.id === "x")!;
    expect(after.description).toBe("Burritos");
    expect(after.amount).toBe(42);
    expect(after.date).toBe("2026-02-02");
    expect(after.split.method).toBe("exact");
    expect(after.createdAt).toBe(before.createdAt); // preserved across the edit
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt); // bumped on edit
  });

  it("updateExpense ignores an unknown expense id", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await addExpense(db, id, expense({ id: "x", description: "Keep" }));
    await updateExpense(db, id, expense({ id: "nope", description: "Ghost" }));
    const expenses = (await read(id)).expenses;
    expect(expenses).toHaveLength(1);
    expect(expenses[0].description).toBe("Keep");
  });

  it("addSettlement appends a settlement", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    const s: Settlement = { id: "s1", from: "p1", to: "p2", amount: 5, date: "2026-01-02" };
    await addSettlement(db, id, s);
    expect((await read(id)).settlements).toHaveLength(1);
  });
});

describe("renameGroup", () => {
  it("updates the name", async () => {
    const id = await createGroup(db, { name: "Old", ownerUid: "uA", ownerName: "A" });
    await renameGroup(db, id, "New");
    expect((await read(id)).name).toBe("New");
  });
});

describe("subscriptions", () => {
  it("subscribeGroup fires with the current document and on change", async () => {
    const id = await createGroup(db, { name: "Sub", ownerUid: "uA", ownerName: "A" });
    const seen: (GroupDoc | null)[] = [];
    const unsub = subscribeGroup(db, id, (g) => seen.push(g));
    await addExpense(db, id, expense());
    await new Promise((r) => setTimeout(r, 300));
    unsub();
    expect(seen.some((g) => g?.expenses.length === 1)).toBe(true);
  });

  it("subscribeMyGroups returns only groups the uid belongs to", async () => {
    const mine = await createGroup(db, { name: "Mine", ownerUid: "uMe", ownerName: "Me" });
    await createGroup(db, { name: "Theirs", ownerUid: "uOther", ownerName: "Other" });
    const results: GroupDoc[][] = [];
    const unsub = subscribeMyGroups(db, "uMe", (gs) => results.push(gs));
    await new Promise((r) => setTimeout(r, 300));
    unsub();
    const last = results[results.length - 1];
    expect(last.map((g) => g.id)).toEqual([mine]);
  });
});
