// @vitest-environment jsdom
//
// End-to-end style integration test against the LIVE Firebase emulator.
// Uses the real client SDK, the real firestore.rules, the real auth/db code,
// and the real UI render functions — the same paths the deployed app uses.
//
// Requires the Firestore + Auth emulators running on 8080 / 9099 with project
// "cashsplit-81b97" (see how this test is launched in the chat).
import { beforeAll, describe, it, expect } from "vitest";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, type Firestore } from "firebase/firestore";

import * as authApi from "../src/auth";
import * as dbApi from "../src/db";
import { renderSettle } from "../src/ui/settle";
import { groupExpensesToCsv } from "../src/export";
import type { GroupDoc } from "../src/types";

// Match the emulator's configured project (firebase.json singleProjectMode) so
// generated oob codes are queryable. Hosts auto-detect under `emulators:exec`.
const PROJECT_ID = "cashsplit-demo";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

beforeAll(() => {
  app = initializeApp({ apiKey: "demo", projectId: PROJECT_ID });
  auth = getAuth(app);
  db = getFirestore(app);
  // The client SDK never auto-connects from env vars, so connect explicitly.
  // Hosts come from *_EMULATOR_HOST (set by emulators:exec) or local defaults.
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const [host, port] = FS_HOST.split(":");
  connectFirestoreEmulator(db, host, Number(port));
});

function uniqueEmail() {
  return `e2e_${Math.random().toString(36).slice(2)}@example.com`;
}

/** Verify a user's email by following the emulator's out-of-band link. */
async function verifyEmailViaEmulator(email: string) {
  const res = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const { oobCodes = [] } = (await res.json()) as {
    oobCodes?: Array<{ email: string; requestType: string; oobLink: string }>;
  };
  const code = oobCodes.find((c) => c.email === email && c.requestType === "VERIFY_EMAIL");
  if (!code) throw new Error(`No verification code found for ${email}`);
  await fetch(code.oobLink); // emulator marks the email verified
}

async function readGroup(id: string): Promise<GroupDoc> {
  const snap = await getDoc(doc(db, "groups", id));
  return { id, ...(snap.data() as Omit<GroupDoc, "id">) };
}

describe("CashSplit end-to-end (emulator)", () => {
  it("runs the full happy path through the real app code", async () => {
    const ownerEmail = uniqueEmail();

    // 1. Sign up. New users are unverified.
    const owner = await authApi.signUp(auth, ownerEmail, "password123");
    expect(owner.emailVerified).toBe(false);

    // 2. Security rules must BLOCK an unverified user from creating a group.
    await expect(
      dbApi.createGroup(db, { name: "Trip", ownerUid: owner.uid, ownerName: "owner" }),
    ).rejects.toBeTruthy();

    // 3. Verify the email and refresh the token so rules see email_verified.
    await verifyEmailViaEmulator(ownerEmail);
    await owner.reload();
    await owner.getIdToken(true);

    // 4. Now creating a group succeeds.
    const groupId = await dbApi.createGroup(db, {
      name: "Ski Trip",
      ownerUid: owner.uid,
      ownerName: "owner",
    });
    expect(groupId).toBeTruthy();

    // 5. Add a second person (with a Venmo handle) and an expense they paid.
    await dbApi.addPerson(db, groupId, {
      id: "bob",
      name: "Bob",
      venmo: "bob-v",
      uid: null,
    });
    const ownerPersonId = (await readGroup(groupId)).people.find((p) => p.uid === owner.uid)!.id;

    // 5b. The owner sets their OWN Venmo via updateOwnVenmo. It updates only the
    //     person linked to their uid and leaves name-only Bob's handle untouched.
    await dbApi.updateOwnVenmo(db, groupId, owner.uid, "owner-v");
    const afterVenmo = await readGroup(groupId);
    expect(afterVenmo.people.find((p) => p.uid === owner.uid)?.venmo).toBe("owner-v");
    expect(afterVenmo.people.find((p) => p.id === "bob")?.venmo).toBe("bob-v");

    // 5c. The owner renames their OWN person via updateOwnName. Like Venmo, it
    //     only touches the person linked to their uid; name-only Bob is untouched.
    const bobNameBefore = afterVenmo.people.find((p) => p.id === "bob")?.name;
    await dbApi.updateOwnName(db, groupId, owner.uid, "Captain Owner");
    const afterRename = await readGroup(groupId);
    expect(afterRename.people.find((p) => p.uid === owner.uid)?.name).toBe("Captain Owner");
    expect(afterRename.people.find((p) => p.id === "bob")?.name).toBe(bobNameBefore);

    await dbApi.addExpense(db, groupId, {
      id: "exp1",
      description: "Cab",
      amount: 30,
      paidBy: "bob", // Bob paid, split equally => owner owes Bob 15
      date: "2026-06-19",
      split: { method: "equal", participants: [ownerPersonId, "bob"], values: {} },
    });

    // 6. Read it back live; it has the one expense we added.
    const afterAdd = await readGroup(groupId);
    expect(afterAdd.expenses).toHaveLength(1);
    const created = afterAdd.expenses[0];
    expect(created.createdAt).toBe(created.updatedAt); // freshly added => unedited

    // 6b. EDIT that expense through the real db path: bump the amount and date.
    // createdAt must be preserved, updatedAt must advance, and balances recompute.
    await new Promise((r) => setTimeout(r, 20)); // let the clock advance a tick
    await dbApi.updateExpense(db, groupId, {
      id: "exp1",
      description: "Cab (corrected)",
      amount: 50, // Bob paid 50, split equally => owner now owes Bob 25
      paidBy: "bob",
      date: "2026-06-20",
      split: { method: "equal", participants: [ownerPersonId, "bob"], values: {} },
    });
    const group = await readGroup(groupId);
    const edited = group.expenses.find((e) => e.id === "exp1")!;
    expect(edited.amount).toBe(50);
    expect(edited.description).toBe("Cab (corrected)");
    expect(edited.date).toBe("2026-06-20");
    expect(edited.createdAt).toBe(created.createdAt); // preserved across the edit
    expect(edited.updatedAt).toBeGreaterThan(created.updatedAt); // bumped on edit

    // 7. Render the Settle-up UI from the edited group and confirm balances moved.
    const container = document.createElement("div");
    renderSettle(container, group, owner.uid, { onMarkPaid: async () => {}, onUnmarkPaid: async () => {} });

    // 7. The Pay-with-Venmo link is pre-filled with the recomputed $25 owed
    //    (owner is the debtor after the edit bumped the cab to $50).
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.href).toContain("venmo.com/bob-v");
    expect(link.href).toContain("amount=25.00");

    // 8. Only the person who is owed can mark a debt paid. The owner owes
    //    name-only Bob, who has no account to confirm it, so the owner (the
    //    debtor) sees no Mark-paid checkbox — the debt stays open.
    expect(container.querySelector(".settle-row input[type=checkbox]")).toBeNull();

    // 9. A second user signs up, verifies, and joins via the invite path.
    await authApi.logOut(auth);
    const friendEmail = uniqueEmail();
    const friend = await authApi.signUp(auth, friendEmail, "password123");
    await verifyEmailViaEmulator(friendEmail);
    await friend.reload();
    await friend.getIdToken(true);

    await dbApi.joinGroup(db, groupId, friend.uid); // self-join (rules-gated)
    const joined = await readGroup(groupId); // a member can now read it
    expect(joined.memberUids).toContain(friend.uid);
    expect(joined.name).toBe("Ski Trip");

    // 10. Record a settlement, then export the live group to CSV through the
    //     real export path. The CSV reflects the recorded expense and settlement,
    //     with person ids resolved to names.
    await dbApi.addSettlement(db, groupId, {
      id: "set1",
      from: ownerPersonId, // Captain Owner pays Bob back
      to: "bob",
      amount: 25,
      date: "2026-06-21",
    });
    const exported = await readGroup(groupId);
    const csv = groupExpensesToCsv(exported);

    // Expenses section: one row for the corrected $50 cab Bob paid, split evenly,
    // plus a TOTAL row. People are columns in creation order (owner, then Bob).
    expect(csv).toContain("Date,Description,Amount,Paid By,Split,Captain Owner,Bob");
    expect(csv).toContain("2026-06-20,Cab (corrected),50.00,Bob,equal,25.00,25.00");
    expect(csv).toContain("TOTAL,,50.00,,,25.00,25.00");
    // Settlements section: the live settlement, with names resolved.
    expect(csv).toContain("--- SETTLEMENTS ---");
    expect(csv).toContain("2026-06-21,Captain Owner,Bob,25.00");
  }, 30000);
});
