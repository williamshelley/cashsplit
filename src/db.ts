import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { Expense, Group, GroupDoc, Person, Settlement } from "./types";

const GROUPS = "groups";

/** Generate a random id for people / expenses / settlements. */
export function genId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface CreateGroupParams {
  name: string;
  ownerUid: string;
  ownerName: string;
  ownerVenmo?: string | null;
}

/** Create a new group with the creator as owner, first member, and first person. */
export async function createGroup(db: Firestore, params: CreateGroupParams): Promise<string> {
  const now = Date.now();
  const owner: Person = {
    id: genId(),
    name: params.ownerName,
    venmo: params.ownerVenmo ?? null,
    uid: params.ownerUid,
  };
  const group: Group = {
    name: params.name,
    createdAt: now,
    updatedAt: now,
    ownerUid: params.ownerUid,
    memberUids: [params.ownerUid],
    people: [owner],
    expenses: [],
    settlements: [],
  };
  const ref = await addDoc(collection(db, GROUPS), group);
  return ref.id;
}

function touch() {
  return { updatedAt: Date.now() };
}

/** Add the current user's uid to a group's member list (self-join). */
export async function joinGroup(db: Firestore, id: string, uid: string): Promise<void> {
  await updateDoc(doc(db, GROUPS, id), { memberUids: arrayUnion(uid), ...touch() });
}

export async function renameGroup(db: Firestore, id: string, name: string): Promise<void> {
  await updateDoc(doc(db, GROUPS, id), { name, ...touch() });
}

export async function addPerson(db: Firestore, id: string, person: Person): Promise<void> {
  await updateDoc(doc(db, GROUPS, id), { people: arrayUnion(person), ...touch() });
}

/** Read-modify-write a group's `people`, replacing the person with the same id. */
export async function updatePerson(db: Firestore, id: string, person: Person): Promise<void> {
  const ref = doc(db, GROUPS, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Group;
    const people = data.people.map((p) => (p.id === person.id ? person : p));
    tx.update(ref, { people, ...touch() });
  });
}

export async function removePerson(db: Firestore, id: string, personId: string): Promise<void> {
  const ref = doc(db, GROUPS, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Group;
    const people = data.people.filter((p) => p.id !== personId);
    tx.update(ref, { people, ...touch() });
  });
}

export async function addExpense(db: Firestore, id: string, expense: Expense): Promise<void> {
  await updateDoc(doc(db, GROUPS, id), { expenses: arrayUnion(expense), ...touch() });
}

export async function removeExpense(db: Firestore, id: string, expenseId: string): Promise<void> {
  const ref = doc(db, GROUPS, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Group;
    const expenses = data.expenses.filter((e) => e.id !== expenseId);
    tx.update(ref, { expenses, ...touch() });
  });
}

export async function addSettlement(db: Firestore, id: string, settlement: Settlement): Promise<void> {
  await updateDoc(doc(db, GROUPS, id), { settlements: arrayUnion(settlement), ...touch() });
}

export async function removeSettlement(db: Firestore, id: string, settlementId: string): Promise<void> {
  const ref = doc(db, GROUPS, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Group;
    const settlements = data.settlements.filter((s) => s.id !== settlementId);
    tx.update(ref, { settlements, ...touch() });
  });
}

/** Live-subscribe to a single group. Calls back with null if it does not exist. */
export function subscribeGroup(
  db: Firestore,
  id: string,
  onChange: (group: GroupDoc | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, GROUPS, id), (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange({ id: snap.id, ...(snap.data() as Group) });
  });
}

/** Live-subscribe to all groups the given uid is a member of. */
export function subscribeMyGroups(
  db: Firestore,
  uid: string,
  onChange: (groups: GroupDoc[]) => void,
): Unsubscribe {
  const q = query(collection(db, GROUPS), where("memberUids", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    const groups = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Group) }));
    onChange(groups);
  });
}
