import { beforeAll, afterEach, describe, it, expect } from "vitest";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  signUp,
  logIn,
  logOut,
  resetPassword,
  watchAuth,
} from "../src/auth";

// Must match the emulator's configured project (firebase.json singleProjectMode),
// otherwise generated oob codes are stored under the configured project id.
const PROJECT_ID = "cashsplit-demo";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

let app: FirebaseApp;
let auth: Auth;

beforeAll(() => {
  app = initializeApp({ apiKey: "fake-api-key", projectId: PROJECT_ID });
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
});

afterEach(async () => {
  await logOut(auth).catch(() => {});
});

function uniqueEmail(): string {
  return `user_${Math.random().toString(36).slice(2)}@example.com`;
}

async function oobCodes(): Promise<Array<{ requestType: string; email: string }>> {
  const res = await fetch(
    `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
  );
  const json = (await res.json()) as { oobCodes?: Array<{ requestType: string; email: string }> };
  return json.oobCodes ?? [];
}

describe("signUp", () => {
  it("creates an unverified account and sends a verification email", async () => {
    const email = uniqueEmail();
    const user = await signUp(auth, email, "password123");
    expect(user.email).toBe(email);
    expect(user.emailVerified).toBe(false);

    const codes = await oobCodes();
    expect(codes.some((c) => c.requestType === "VERIFY_EMAIL" && c.email === email)).toBe(true);
  });
});

describe("logIn / logOut", () => {
  it("can log in with the right password after signing up", async () => {
    const email = uniqueEmail();
    await signUp(auth, email, "password123");
    await logOut(auth);
    const user = await logIn(auth, email, "password123");
    expect(user.email).toBe(email);
  });

  it("rejects a wrong password", async () => {
    const email = uniqueEmail();
    await signUp(auth, email, "password123");
    await logOut(auth);
    await expect(logIn(auth, email, "wrong-password")).rejects.toBeTruthy();
  });
});

describe("resetPassword", () => {
  it("sends a password reset email", async () => {
    const email = uniqueEmail();
    await signUp(auth, email, "password123");
    await resetPassword(auth, email);
    const codes = await oobCodes();
    expect(codes.some((c) => c.requestType === "PASSWORD_RESET" && c.email === email)).toBe(true);
  });
});

describe("watchAuth", () => {
  it("reports the signed-in user and then null after logout", async () => {
    const email = uniqueEmail();
    const states: (string | null)[] = [];
    const unsub = watchAuth(auth, (user) => states.push(user ? user.email : null));
    await signUp(auth, email, "password123");
    await new Promise((r) => setTimeout(r, 100));
    await logOut(auth);
    await new Promise((r) => setTimeout(r, 100));
    unsub();
    expect(states).toContain(email);
    expect(states[states.length - 1]).toBeNull();
  });
});
