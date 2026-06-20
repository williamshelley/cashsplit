import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const baseGroup = (over: Record<string, unknown> = {}) => ({
  name: "Trip",
  createdAt: 0,
  updatedAt: 0,
  ownerUid: "alice",
  memberUids: ["alice"],
  people: [],
  expenses: [],
  settlements: [],
  ...over,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "cashsplit-demo",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed a group owned by verified "alice".
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "groups/g1"), baseGroup());
  });
});

const verified = (uid: string) =>
  testEnv.authenticatedContext(uid, { email_verified: true }).firestore();
const unverified = (uid: string) =>
  testEnv.authenticatedContext(uid, { email_verified: false }).firestore();

describe("create", () => {
  it("a verified user can create a group they own and belong to", async () => {
    const db = verified("bob");
    await assertSucceeds(
      setDoc(doc(db, "groups/g2"), baseGroup({ ownerUid: "bob", memberUids: ["bob"] })),
    );
  });

  it("cannot create a group owned by someone else", async () => {
    const db = verified("bob");
    await assertFails(
      setDoc(doc(db, "groups/g2"), baseGroup({ ownerUid: "alice", memberUids: ["bob"] })),
    );
  });

  it("an unverified user cannot create a group", async () => {
    const db = unverified("bob");
    await assertFails(
      setDoc(doc(db, "groups/g2"), baseGroup({ ownerUid: "bob", memberUids: ["bob"] })),
    );
  });
});

describe("read", () => {
  it("a member can read the group", async () => {
    await assertSucceeds(getDoc(doc(verified("alice"), "groups/g1")));
  });
  it("a non-member cannot read the group", async () => {
    await assertFails(getDoc(doc(verified("mallory"), "groups/g1")));
  });
  it("an unverified member cannot read the group", async () => {
    await assertFails(getDoc(doc(unverified("alice"), "groups/g1")));
  });
});

describe("update", () => {
  it("a member can update group data", async () => {
    await assertSucceeds(updateDoc(doc(verified("alice"), "groups/g1"), { name: "Vacation" }));
  });
  it("a non-member cannot update arbitrary fields", async () => {
    await assertFails(updateDoc(doc(verified("mallory"), "groups/g1"), { name: "Hacked" }));
  });
});

describe("join", () => {
  it("a verified non-member can add only themselves to memberUids", async () => {
    await assertSucceeds(
      updateDoc(doc(verified("bob"), "groups/g1"), { memberUids: ["alice", "bob"] }),
    );
  });
  it("cannot add someone else's uid when joining", async () => {
    await assertFails(
      updateDoc(doc(verified("bob"), "groups/g1"), { memberUids: ["alice", "carol"] }),
    );
  });
  it("an unverified user cannot join", async () => {
    await assertFails(
      updateDoc(doc(unverified("bob"), "groups/g1"), { memberUids: ["alice", "bob"] }),
    );
  });

  it("a non-member joining cannot also seize ownership", async () => {
    await assertFails(
      updateDoc(doc(verified("mallory"), "groups/g1"), {
        memberUids: ["alice", "mallory"],
        ownerUid: "mallory",
      }),
    );
  });

  it("a non-member joining cannot wipe or alter group data", async () => {
    await assertFails(
      updateDoc(doc(verified("mallory"), "groups/g1"), {
        memberUids: ["alice", "mallory"],
        expenses: [{ id: "x", description: "h", amount: 0, paidBy: "x", date: "", split: {} }],
      }),
    );
    await assertFails(
      updateDoc(doc(verified("mallory"), "groups/g1"), {
        memberUids: ["alice", "mallory"],
        people: [{ id: "h", name: "Hacker", venmo: null, uid: "mallory" }],
      }),
    );
  });

  it("a non-member joining cannot remove existing members", async () => {
    await assertFails(
      updateDoc(doc(verified("mallory"), "groups/g1"), { memberUids: ["mallory"] }),
    );
  });
});

describe("update — privilege boundaries", () => {
  beforeEach(async () => {
    // Re-seed g1 with two members for member-vs-member tests.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "groups/g1"), baseGroup({ memberUids: ["alice", "bob"] }));
    });
  });

  it("a member cannot change the owner", async () => {
    await assertFails(updateDoc(doc(verified("bob"), "groups/g1"), { ownerUid: "bob" }));
  });

  it("a member cannot remove another member", async () => {
    await assertFails(updateDoc(doc(verified("bob"), "groups/g1"), { memberUids: ["bob"] }));
  });

  it("a member cannot alter createdAt", async () => {
    await assertFails(updateDoc(doc(verified("bob"), "groups/g1"), { createdAt: 999 }));
  });

  it("a member can still edit group content (name, expenses)", async () => {
    await assertSucceeds(
      updateDoc(doc(verified("bob"), "groups/g1"), {
        name: "Vacation",
        expenses: [{ id: "e", description: "Tacos", amount: 9, paidBy: "p", date: "2026-01-01", split: {} }],
        updatedAt: 1,
      }),
    );
  });

  it("a member can edit an existing expense in place", async () => {
    // Seed g1 with an expense, then have a member rewrite it with a new amount/date.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "groups/g1"),
        baseGroup({
          memberUids: ["alice", "bob"],
          expenses: [
            { id: "e1", description: "Cab", amount: 30, paidBy: "p", date: "2026-01-01", split: {}, createdAt: 1, updatedAt: 1 },
          ],
        }),
      );
    });
    await assertSucceeds(
      updateDoc(doc(verified("bob"), "groups/g1"), {
        expenses: [
          { id: "e1", description: "Cab", amount: 42, paidBy: "p", date: "2026-02-02", split: {}, createdAt: 1, updatedAt: 2 },
        ],
        updatedAt: 2,
      }),
    );
  });
});

describe("delete", () => {
  it("the owner can delete the group", async () => {
    await assertSucceeds(deleteDoc(doc(verified("alice"), "groups/g1")));
  });
  it("a non-owner member cannot delete the group", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "groups/g1"), baseGroup({ memberUids: ["alice", "bob"] }));
    });
    await assertFails(deleteDoc(doc(verified("bob"), "groups/g1")));
  });
});
