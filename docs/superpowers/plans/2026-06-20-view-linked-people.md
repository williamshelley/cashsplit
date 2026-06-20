# View Linked People Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the People tab, show each person's link status (You / Linked / Not linked) plus a "{n} of {m} linked" summary.

**Architecture:** Two pure view-model helpers in `src/ui/viewmodel.ts` (`personLinkState`, `linkSummary`) compute status from `Person.uid`; `renderPeopleTab` in `src/ui/group.ts` renders a per-row badge and a summary line. Read-only — no model, db, or rules changes.

**Tech Stack:** TypeScript, Vite, Vitest (node for pure helpers, jsdom for DOM), the project's `el`/`mount` hyperscript helpers.

## Global Constraints

- Link semantics from `Person.uid` (`src/types.ts`): `uid == null` → **unlinked**; `uid === currentUid` → **you**; any other non-null `uid` → **linked** (some other account).
- Badge labels, verbatim: `you` → `"You"`, `linked` → `"Linked"`, `unlinked` → `"Not linked"`.
- Summary text, verbatim: `` `${linked} of ${total} linked` `` (e.g. `2 of 3 linked`).
- "Linked" conveys status only — the group stores no member emails, so never attempt to name *whose* account a person is linked to.
- Pure helpers must not import DOM/Firebase. Keep the existing pure-helper (`viewmodel.ts`) / DOM (`group.ts`) split.
- Commands: pure tests `npm run test:unit`; full suite incl. emulator `npm run test:run` (emulator needs Java).

---

### Task 1: `personLinkState` pure helper

**Files:**
- Modify: `src/ui/viewmodel.ts` (add export at end of file)
- Test: `tests/ui/viewmodel.test.ts`

**Interfaces:**
- Consumes: `Person` from `../types` (already imported in viewmodel.ts).
- Produces: `export type LinkState = "you" | "linked" | "unlinked"` and `export function personLinkState(person: Person, currentUid: string | null): LinkState`.

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/viewmodel.test.ts`. Extend the existing import from `../../src/ui/viewmodel` to also include `personLinkState`:

```ts
describe("personLinkState", () => {
  const p = (uid: string | null) => ({ id: "x", name: "X", venmo: null, uid });
  it("returns 'you' when the person is linked to the current account", () => {
    expect(personLinkState(p("uA"), "uA")).toBe("you");
  });
  it("returns 'linked' when the person is linked to a different account", () => {
    expect(personLinkState(p("uC"), "uA")).toBe("linked");
  });
  it("returns 'unlinked' when the person has no account", () => {
    expect(personLinkState(p(null), "uA")).toBe("unlinked");
  });
  it("never reports 'you' when there is no current account", () => {
    expect(personLinkState(p("uC"), null)).toBe("linked");
    expect(personLinkState(p(null), null)).toBe("unlinked");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/ui/viewmodel.test.ts`
Expected: FAIL — `personLinkState is not a function` / import has no such export.

- [ ] **Step 3: Write minimal implementation**

Append to `src/ui/viewmodel.ts`:

```ts
export type LinkState = "you" | "linked" | "unlinked";

/** How a person relates to the current account: you, linked to another account, or unlinked. */
export function personLinkState(person: Person, currentUid: string | null): LinkState {
  if (person.uid == null) return "unlinked";
  if (person.uid === currentUid) return "you";
  return "linked";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/ui/viewmodel.test.ts`
Expected: PASS (all `personLinkState` cases green).

- [ ] **Step 5: Commit**

```bash
git add src/ui/viewmodel.ts tests/ui/viewmodel.test.ts
git commit -m "Add personLinkState view-model helper"
```

---

### Task 2: `linkSummary` pure helper

**Files:**
- Modify: `src/ui/viewmodel.ts` (add export at end of file)
- Test: `tests/ui/viewmodel.test.ts`

**Interfaces:**
- Consumes: `Group` from `../types` (already imported in viewmodel.ts).
- Produces: `export interface LinkSummary { linked: number; total: number }` and `export function linkSummary(group: Group): LinkSummary`.

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/viewmodel.test.ts` (also add `linkSummary` to the import). The file's `group()` factory and module-level `people` (Alice `uid:"uA"`, Bob `uid:"uB"`, Carol `uid:null`) already exist — reuse them:

```ts
describe("linkSummary", () => {
  it("counts people linked to an account vs. total (mixed)", () => {
    // module `people`: Alice uA, Bob uB, Carol null => 2 of 3
    expect(linkSummary(group())).toEqual({ linked: 2, total: 3 });
  });
  it("counts all linked", () => {
    const g = group({ people: [
      { id: "a", name: "A", venmo: null, uid: "uA" },
      { id: "b", name: "B", venmo: null, uid: "uB" },
    ] });
    expect(linkSummary(g)).toEqual({ linked: 2, total: 2 });
  });
  it("counts none linked", () => {
    const g = group({ people: [{ id: "a", name: "A", venmo: null, uid: null }] });
    expect(linkSummary(g)).toEqual({ linked: 0, total: 1 });
  });
  it("handles an empty group", () => {
    const g = group({ people: [] });
    expect(linkSummary(g)).toEqual({ linked: 0, total: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/ui/viewmodel.test.ts`
Expected: FAIL — `linkSummary is not a function` / import has no such export.

- [ ] **Step 3: Write minimal implementation**

Append to `src/ui/viewmodel.ts`:

```ts
export interface LinkSummary {
  linked: number;
  total: number;
}

/** Count of people linked to an account vs. total people in the group. */
export function linkSummary(group: Group): LinkSummary {
  return {
    linked: group.people.filter((p) => p.uid != null).length,
    total: group.people.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/ui/viewmodel.test.ts`
Expected: PASS (all `linkSummary` cases green).

- [ ] **Step 5: Commit**

```bash
git add src/ui/viewmodel.ts tests/ui/viewmodel.test.ts
git commit -m "Add linkSummary view-model helper"
```

---

### Task 3: Render per-row badge + summary line in the People tab

**Files:**
- Modify: `src/ui/group.ts` (imports; `renderPeopleTab` at lines ~133-233)
- Modify: `src/styles.css` (add badge styles after the `.list-item` block, ~line 108)
- Test: `tests/ui/group.test.ts`

**Interfaces:**
- Consumes: `personLinkState`, `linkSummary`, `LinkState` from `./viewmodel` (Tasks 1-2).
- Produces: each `.list-item` person row contains exactly one `span.badge` whose text is `You` / `Linked` / `Not linked`; the People card shows a `2 of 3 linked`-style summary line. The bespoke `(you)` span is removed (subsumed by the badge).

- [ ] **Step 1: Write the failing test**

In `tests/ui/group.test.ts`, add a `rowBadge` helper after the existing `rowButton` helper (~line 58):

```ts
function rowBadge(row: HTMLElement): HTMLElement | null {
  return row.querySelector(".badge");
}
```

Then **replace** the existing `(you)` assertion inside the test
`"shows a 'This is me' button on every person except the one already linked to you"`
— change this line:

```ts
    expect(alice.textContent).toContain("(you)");
```

to:

```ts
    expect(rowBadge(alice)?.textContent).toBe("You");
```

Then add a new test inside the `describe("People tab: connect to a person", ...)` block:

```ts
  it("shows a link-status badge on every person and a linked summary", () => {
    const container = document.createElement("div");
    renderGroup(container, multiGroup(), actions({ currentUid: "uA" }), "people");

    expect(rowBadge(personRow(container, "Alice"))?.textContent).toBe("You");
    expect(rowBadge(personRow(container, "Bob"))?.textContent).toBe("Not linked");
    expect(rowBadge(personRow(container, "Carol"))?.textContent).toBe("Linked");
    expect(container.textContent).toContain("2 of 3 linked");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/ui/group.test.ts`
Expected: FAIL — no `.badge` element (`rowBadge(...)` is null) and no `"2 of 3 linked"` text.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/group.ts`, update the viewmodel import (line 5) to add the new symbols:

```ts
import { formatMoney, personLinkState, linkSummary, type LinkState } from "./viewmodel";
```

Add a label map and badge builder near the top-level helpers (e.g. just after `personName`, ~line 75):

```ts
const LINK_LABEL: Record<LinkState, string> = {
  you: "You",
  linked: "Linked",
  unlinked: "Not linked",
};

function linkBadge(state: LinkState): HTMLElement {
  return el("span", { class: `badge badge-${state}` }, LINK_LABEL[state]);
}
```

In `renderPeopleTab`, replace the name `<span>` block (currently lines ~194-197):

```ts
          el("span", { style: "flex:1" }, [
            el("strong", {}, p.name),
            p.uid === actions.currentUid ? el("span", { class: "hint" }, " (you)") : null,
          ]),
```

with:

```ts
          el("span", { style: "flex:1" }, [
            el("strong", {}, p.name),
            linkBadge(personLinkState(p, actions.currentUid)),
          ]),
```

Add the summary line to the People card header. Replace the heading line (currently `el("h3", {}, "People") as Node,` ~line 182) with the heading plus a summary hint:

```ts
      el("h3", {}, "People") as Node,
      el("div", { class: "hint" }, `${linkSummary(group).linked} of ${linkSummary(group).total} linked`) as Node,
```

- [ ] **Step 4: Add badge styles**

In `src/styles.css`, after the `.list-item:last-child` rule (~line 108), add:

```css
.badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  vertical-align: middle;
  border: 1px solid var(--border);
  color: var(--muted);
}
.badge-you { background: var(--brand); border-color: var(--brand); color: #fff; }
.badge-linked { border-color: var(--brand-2); color: var(--brand-2); }
.badge-unlinked { color: var(--muted); }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — all unit tests green, including the updated and new `group.test.ts` cases. (Full file run confirms the `(you)` → badge change didn't break siblings.)

- [ ] **Step 6: Type-check the build**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/group.ts src/styles.css tests/ui/group.test.ts
git commit -m "Show link-status badge and summary in the People tab"
```

---

### Task 4: Full verification + live E2E

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit`
Expected: all green.

- [ ] **Step 2: Run the emulator-backed suite**

Run: `npm run test:run` (requires Java on PATH — see project memory `emulator-java-setup`).
Expected: all green (no behavior change expected; confirms nothing regressed).

- [ ] **Step 3: Stand up services for live E2E**

- Start the Firebase emulators (auth + firestore) using the project's emulator config.
- Start the Vite dev server (`npm run dev`).
- Drive a real browser (Playwright MCP): sign up / sign in a verified user, create a group, add two people (one as "me", one name-only), and a third person, then confirm:
  - Your row shows the **You** badge; the name-only person shows **Not linked**; a person linked to another account shows **Linked**.
  - The summary line reads the correct `{n} of {m} linked` count and updates live after a "This is me" link.
- Capture a screenshot of the People tab as evidence.

- [ ] **Step 4: Final commit (if any e2e-driven fixes were needed)**

```bash
git add -A
git commit -m "Fixups from live e2e verification"   # only if changes were required
```

---

## Self-Review

**1. Spec coverage:**
- Spec "personLinkState helper" → Task 1. ✓
- Spec "linkSummary helper" → Task 2. ✓
- Spec "per-row badge replacing (you)" + "summary line" + CSS → Task 3. ✓
- Spec "pure unit tests" → Tasks 1-2; "DOM tests on multiGroup" → Task 3; "E2E live testing" → Task 4. ✓
- Spec "no rules/model changes" → honored; no task touches `firestore.rules`/`types.ts`/`db.ts`. ✓
- Spec "data constraint: don't name whose account" → Global Constraints; badge labels never include identity. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**3. Type consistency:** `LinkState` defined in Task 1 and imported in Task 3; `personLinkState(person, currentUid)` and `linkSummary(group)` signatures match between definition (Tasks 1-2) and use (Task 3). Badge labels match Global Constraints verbatim. `actions.currentUid` is `string` (GroupActions), assignable to `currentUid: string | null`. ✓
