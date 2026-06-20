# View Which People in a Group Are Already Linked

**Date:** 2026-06-20
**Status:** Approved
**Branch:** `worktree-view-linked-people`

## Problem

A CashSplit group contains "people" (named entries like Alice, Bob). Each person may be
**linked** to a real Firebase Auth account via `Person.uid`. Today the People tab only
surfaces *your own* link as a `(you)` hint — there is no way to see, at a glance, which
*other* people in the group are already linked to an account and which are still
name-only. This makes it unclear whether everyone has claimed their identity.

## Goal

In the People tab, show each person's link status (You / Linked / Not linked) plus a
summary count (e.g. "2 of 3 linked"). Read-only: no changes to the data model, write
paths, or security rules.

## Link semantics

The single source of truth is `Person.uid` (`src/types.ts`):

- `uid === currentUid` → **You** (this account is linked to this person)
- `uid != null` and `!== currentUid` → **Linked** (some *other* account is linked)
- `uid == null` → **Not linked** (name-only / offline person)

**Data constraint (explicit):** "Linked" means only "an account is attached to this
person." The group document stores no member emails or profiles, so we *cannot* name
*whose* account a foreign-linked person belongs to. We show status, not identity, beyond
the person's own name. `memberUids` (group access) is intentionally separate from
per-person linking and is not used here.

## Approach

Follow the existing split between pure view-model logic (`src/ui/viewmodel.ts`,
node-tested) and DOM rendering (`src/ui/group.ts`, jsdom-tested). Put the status rules in
pure, unit-tested helpers; keep `group.ts` as thin wiring. (Rejected alternative:
inlining the status logic directly in `renderPeopleTab` — it would couple the rules to
the DOM and require jsdom to test them, against the codebase's grain.)

## Components

### 1. `personLinkState(person, currentUid)` → `"you" | "linked" | "unlinked"`

New pure helper in `src/ui/viewmodel.ts`. Encodes the link semantics above. `currentUid`
may be `null` (logged-out / unknown) — in that case a person with any non-null `uid` is
`"linked"`, never `"you"`.

### 2. `linkSummary(group)` → `{ linked: number; total: number }`

New pure helper in `src/ui/viewmodel.ts`. `total` = `group.people.length`; `linked` =
count of people with `uid != null` (includes you). Drives the summary line. No
`currentUid` is needed — the counts do not depend on who is viewing.

### 3. Render wiring in `renderPeopleTab` (`src/ui/group.ts`)

- **Per-row badge:** a status pill on each person row, label **You** / **Linked** /
  **Not linked**, derived from `personLinkState`. This *replaces* the current bespoke
  `(you)` span (the three-state badge subsumes it).
- **Summary line:** near the People tab header, render `"{linked} of {total} linked"`
  from `linkSummary`.
- Everything else stays as-is: the "This is me" button (still shown on every row except
  your own, including takeover of a Linked person), the Venmo input, and Remove.

No new CSS structure required beyond a small badge class reusing existing styling
conventions; if no suitable class exists, add a minimal `.badge`-style hook.

## Testing (TDD — failing test first for each unit)

### Pure unit tests (`tests/ui/viewmodel.test.ts`, node env)

- `personLinkState`: returns `"you"` when `uid === currentUid`; `"linked"` when `uid` is
  another non-null value; `"unlinked"` when `uid == null`; treats `currentUid == null` as
  never `"you"`.
- `linkSummary`: counts linked vs total (mixed); all-linked; none-linked; empty
  group (`0 of 0`).

### DOM tests (`tests/ui/group.test.ts`, jsdom env)

Using the existing `multiGroup()` fixture (Alice `uid:"uA"`=you, Bob `uid:null`,
Carol `uid:"uC"`=other):

- Alice's row shows the **You** badge; Bob's shows **Not linked**; Carol's shows
  **Linked**.
- The summary line reads "2 of 3 linked".
- Existing behavior preserved: "This is me" still absent on Alice's row, present on
  Bob's and Carol's.

### E2E live testing

Stand up the Firebase emulator (auth + firestore) and the Vite dev server, then drive a
real browser (Playwright) to: create a group, add people, use "This is me" to link
yourself, and confirm the per-row badges and summary line render and update live via
`onSnapshot`. (Emulator tests require Java — see project memory.)

## Security / rules

No changes. The feature reads `Person.uid` values that members can already read under the
existing `allow read: if isMember()` rule. No write paths are touched.

## Out of scope (YAGNI)

- Naming the specific email/account a person is linked to.
- Filtering or sorting people by link status.
- Any new write or mutation behavior.
