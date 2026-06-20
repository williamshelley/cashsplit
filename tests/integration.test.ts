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
    await dbApi.addExpense(db, groupId, {
      id: "exp1",
      description: "Cab",
      amount: 30,
      paidBy: "bob", // Bob paid, split equally => owner owes Bob 15
      date: "2026-06-19",
      split: { method: "equal", participants: [ownerPersonId, "bob"], values: {} },
    });

    // 6. Read it back live and render the Settle-up UI from the real group.
    const group = await readGroup(groupId);
    expect(group.expenses).toHaveLength(1);

    const container = document.createElement("div");
    let markedPaid = false;
    renderSettle(container, group, {
      onMarkPaid: async (row) => {
        markedPaid = true;
        await dbApi.addSettlement(db, groupId, {
          id: "s1",
          from: row.fromId,
          to: row.toId,
          amount: row.amount,
          date: "2026-06-19",
        });
      },
    });

    // 7. The Pay-with-Venmo link is present and pre-filled.
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.href).toContain("venmo.com/bob-v");
    expect(link.href).toContain("amount=15.00");

    // 8. Clicking "Mark paid" records a settlement that clears the balance.
    const payBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      /mark paid/i.test(b.textContent ?? ""),
    ) as HTMLButtonElement;
    payBtn.click();
    await new Promise((r) => setTimeout(r, 200));
    expect(markedPaid).toBe(true);
    expect((await readGroup(groupId)).settlements).toHaveLength(1);

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
  }, 30000);
});
