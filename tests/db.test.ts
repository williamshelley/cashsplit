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
  removePerson,
  addExpense,
  removeExpense,
  addSettlement,
  subscribeGroup,
  subscribeMyGroups,
  renameGroup,
} from "../src/db";
import type { Expense, GroupDoc, Person, Settlement } from "../src/types";

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

const expense = (over: Partial<Expense> = {}): Expense => ({
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
});

describe("expenses + settlements", () => {
  it("addExpense and removeExpense work", async () => {
    const id = await createGroup(db, { name: "T", ownerUid: "uA", ownerName: "A" });
    await addExpense(db, id, expense({ id: "x", description: "Tacos" }));
    expect((await read(id)).expenses.map((e) => e.description)).toContain("Tacos");
    await removeExpense(db, id, "x");
    expect((await read(id)).expenses).toHaveLength(0);
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
