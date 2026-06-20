# CashSplit

A Splitwise-style expense splitter. Create a group, add people, log expenses with
flexible splitting, see who owes whom, check off payments, and pay with one tap via a
**Venmo deep link** that pre-fills the recipient and amount.

- **Frontend:** TypeScript + Vite, deployed as a static site on **GitHub Pages**.
- **Backend:** **Firebase** — Firestore for data (live sync across devices) and Firebase
  Auth for accounts. No server to run or maintain.
- **Live updates:** changes made by anyone in a group appear instantly for everyone
  (Firestore `onSnapshot`), so you share an invite link once — not on every change.
- **Built with strict TDD:** every unit was specified by a failing test first. CI runs
  the full suite (including Firebase emulator tests) and blocks deploys on any red test.

## Features

- Email/password accounts with **email verification** and password reset.
- Create groups and **invite people with a link** — opening it signs the person in and
  auto-joins them to the group.
- Add expenses with four split methods: **equal, exact amounts, percentages, shares**.
  A live preview always reconciles the split to the total before you can save.
- **Settle up** view: a minimal who-owes-whom list, each with a **Pay with Venmo** button
  and a **Mark paid** action.
- Per-person **Venmo handles**; the Pay button deep-links to Venmo with amount + note.

## Project layout

```
src/
  model.ts        # pure money math: shares, balances, debt simplification
  venmo.ts        # Venmo deep-link builder
  db.ts           # Firestore CRUD, live subscriptions, join flow
  auth.ts         # signup/login/verify/reset (Firebase Auth)
  firebase.ts     # Firebase app/auth/firestore singletons
  firebase-config.ts  # PUBLIC web config (see setup)
  ui/             # DOM views + pure view-model helpers
  main.ts         # auth gate + hash router + wiring
firestore.rules   # security rules (verified + per-group membership)
tests/            # Vitest specs (pure + emulator-backed)
.github/workflows/deploy.yml  # CI: test -> build -> deploy to Pages
```

## Setup

### 1. Install

```bash
npm install
```

### 2. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a
   project (the free **Spark** plan is enough).
2. Add a **Web app** and copy its config object.
3. **Authentication → Sign-in method → enable Email/Password.**
4. **Firestore Database → create database** (Production mode).
5. **Firestore → Rules:** paste the contents of [`firestore.rules`](./firestore.rules)
   and publish.

### 3. Add your Firebase config

Firebase web config values are **public by design** (they identify your project to the
client; they are not secrets — access is controlled by the security rules + Auth). Put
them in [`src/firebase-config.ts`](./src/firebase-config.ts), replacing the placeholders.

Alternatively, set them as Vite env vars in a local `.env` (and/or as GitHub Actions
secrets — see below):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 4. Run locally

```bash
npm run dev       # start the dev server
```

## Testing (TDD)

```bash
npm test              # Vitest watch mode
npm run typecheck     # tsc --noEmit
npm run test:run      # full suite: pure unit tests + Firebase emulator tests
```

The emulator suites (`tests/rules.test.ts`, `tests/db.test.ts`, `tests/auth.test.ts`)
run against the **Firebase Local Emulator Suite** via `firebase emulators:exec`, which
requires a JVM (Java 11+). The pure tests (`model`, `venmo`, `ui`) need only Node.

## Deploy to GitHub Pages

This repo includes a workflow that **tests, builds, and deploys** on every push to
`main`:

1. Merge this branch into `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub
   Actions**.
3. (Optional) If you prefer not to commit your Firebase config, add the `VITE_FIREBASE_*`
   values as **repository secrets**; the build reads them automatically.
4. The site publishes at `https://<your-user>.github.io/cashsplit/`.

> The Vite `base` is set to `/cashsplit/`. If you host under a different repo name or a
> custom domain, update `base` in `vite.config.ts`.

## Security model & tradeoffs

This project started from a "no security concerns" idea, then evolved to real accounts.
Because live cross-device sync needs a shared backend, data lives in Firebase (group
names, member names, expense amounts, Venmo handles — **no payment credentials and no
passwords are ever stored by the app**). The design keeps the attack surface small:

- **No custom auth server.** Firebase handles password hashing, verification emails, and
  JWT (ID token) issuance/refresh. We never roll our own tokens.
- **Per-group authorization** in `firestore.rules`: only a **verified, signed-in member**
  can read or write a group. An invite link lets a verified user **self-join** by adding
  *only their own* uid (they can't add anyone else). Group owners can delete.
- **Public-safe client config** — protected by rules + Auth, not by hiding values.
- **Last-write-wins** on a group document; fine for small groups editing casually.

Out of scope (by choice): MFA (can be added later via Firebase Identity Platform without
rework), the real Venmo API/OAuth (we use deep links only), and multiple currencies.
