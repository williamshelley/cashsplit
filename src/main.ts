import "./styles.css";
import type { Unsubscribe, User } from "firebase/auth";
import type { GroupDoc } from "./types";
import { isConfigPlaceholder } from "./firebase-config";
import { authScreen } from "./ui/viewmodel";
import { el, mount } from "./ui/dom";
import { renderAuth, renderVerify } from "./ui/auth";
import { renderHome } from "./ui/home";
import { renderGroup, type GroupActions, type GroupTab } from "./ui/group";
import * as dbApi from "./db";
import * as authApi from "./auth";

const appEl = document.getElementById("app")!;

if (isConfigPlaceholder()) {
  renderSetupNotice();
} else {
  void bootstrap();
}

function renderSetupNotice() {
  mount(
    appEl,
    el("div", { class: "topbar" }, [el("div", { class: "brand" }, [el("span", {}, "Cash"), "Split"])]),
    el("div", { class: "banner" }, [
      "Firebase is not configured yet. Add your project's web config to ",
      el("code", {}, "src/firebase-config.ts"),
      " (or set the ",
      el("code", {}, "VITE_FIREBASE_*"),
      " env vars), then reload. See the README for setup steps.",
    ]),
  );
}

async function bootstrap() {
  // Firebase singletons are imported lazily so the app can render the setup
  // notice (above) without initializing against a placeholder config.
  const { auth, db } = await import("./firebase");

  // Where Firebase sends the user back after an email action (verify or password
  // reset): the deployed site root. Without it the user dead-ends on Firebase's
  // generic page after acting; for reset that dead end is also how the "expired
  // or already used" error happens — Back reloads the spent link. origin handles
  // prod/dev hosts; BASE_URL is "/cashsplit/" in prod and "/" in dev.
  // handleCodeInApp:false keeps Firebase's hosted handlers (we don't process the
  // oobCode ourselves).
  const continueSettings = {
    url: window.location.origin + import.meta.env.BASE_URL,
    handleCodeInApp: false,
  };

  let routeUnsub: Unsubscribe | null = null;
  let verifyTeardown: (() => void) | null = null;
  let currentUser: User | null = null;
  let refreshing = false;

  const clearRoute = () => {
    if (routeUnsub) { routeUnsub(); routeUnsub = null; }
    if (verifyTeardown) { verifyTeardown(); verifyTeardown = null; }
  };

  // Re-check verification with the server and advance into the app if it flipped.
  // Used by the manual "I've verified" button and auto-triggered when the user
  // returns to the tab after verifying. Loop-safe: guarded against re-entrancy,
  // missing user, and the already-verified case so repeated focus events are cheap.
  async function refreshVerification() {
    if (refreshing || !auth.currentUser || auth.currentUser.emailVerified) return;
    refreshing = true;
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        // Force a fresh ID token so the email_verified claim is updated for
        // Firestore rules (reload alone reuses the cached, still-false token).
        await auth.currentUser.getIdToken(true);
      }
      currentUser = auth.currentUser;
      route();
    } catch {
      // Transient (e.g. network) — leave the user on the verify gate; the manual
      // button and the next focus event remain as retries.
    } finally {
      refreshing = false;
    }
  }

  const navigate = (hash: string) => {
    if (window.location.hash !== hash) window.location.hash = hash;
    else route();
  };

  function route() {
    clearRoute();
    const screen = authScreen(currentUser);
    if (screen === "auth") {
      renderAuth(appEl, {
        signUp: async (email, password) => { await authApi.signUp(auth, email, password, continueSettings); },
        logIn: async (email, password) => { await authApi.logIn(auth, email, password); },
        resetPassword: async (email) => { await authApi.resetPassword(auth, email, continueSettings); },
      });
      return;
    }
    if (screen === "verify") {
      renderVerify(appEl, currentUser?.email ?? "your email", {
        resend: async () => { await authApi.resendVerification(auth, continueSettings); },
        reload: async () => { await refreshVerification(); },
        logOut: async () => { await authApi.logOut(auth); },
      });

      // Auto-detect verification when the user returns to this tab/window after
      // clicking the email link. Listeners are torn down on the next route() via
      // clearRoute(), so they live only while the verify gate is shown.
      const onVisible = () => { if (document.visibilityState === "visible") void refreshVerification(); };
      const onFocus = () => { void refreshVerification(); };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onFocus);
      verifyTeardown = () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onFocus);
      };
      // Attempt once on mount (covers verifying in another tab while this one waits).
      void refreshVerification();
      return;
    }

    // Verified app routes.
    const hash = window.location.hash;
    const groupMatch = hash.match(/^#\/g\/(.+)$/);
    if (groupMatch) {
      openGroup(groupMatch[1]);
    } else {
      openHome();
    }
  }

  function renderSubscriptionError(error: Error) {
    mount(
      appEl,
      el("div", { class: "topbar" }, [el("div", { class: "brand" }, [el("span", {}, "Cash"), "Split"])]),
      el("div", { class: "card stack" }, [
        el("h3", {}, "Couldn't load your data"),
        el("p", { class: "hint" }, "This can happen for a moment right after verifying your email. Refreshing your session usually fixes it."),
        el("p", { class: "error" }, error.message),
        el("div", { class: "row" }, [
          el("button", {
            class: "btn primary",
            onClick: async () => { await auth.currentUser?.getIdToken(true); route(); },
          }, "Refresh session"),
          el("button", { class: "btn", onClick: async () => { await authApi.logOut(auth); } }, "Log out"),
        ]),
      ]),
    );
  }

  function openHome() {
    const uid = currentUser!.uid;
    mount(appEl, el("div", { class: "card empty" }, "Loading your groups…"));
    routeUnsub = dbApi.subscribeMyGroups(db, uid, (groups: GroupDoc[]) => {
      renderHome(appEl, groups, {
        userEmail: currentUser?.email ?? "",
        onOpen: (id) => navigate(`#/g/${id}`),
        onCreate: async (name) => {
          const id = await dbApi.createGroup(db, {
            name,
            ownerUid: uid,
            ownerName: deriveName(currentUser),
          });
          navigate(`#/g/${id}`);
        },
        onLogout: async () => { await authApi.logOut(auth); },
      });
    }, renderSubscriptionError);
  }

  async function openGroup(id: string) {
    const uid = currentUser!.uid;
    // Self-join (idempotent) so we have read access, then subscribe live.
    try {
      await dbApi.joinGroup(db, id, uid);
    } catch {
      mount(
        appEl,
        el("div", { class: "topbar" }, [
          el("button", { class: "btn small", onClick: () => navigate("#/") }, "← Groups"),
        ]),
        el("div", { class: "card empty" }, "This group could not be opened. It may not exist."),
      );
      return;
    }
    mount(appEl, el("div", { class: "card empty" }, "Loading group…"));

    // Keep the active tab in parent state so live snapshot re-renders don't
    // bounce the user back to the default "Expenses" tab.
    let tab: GroupTab = "expenses";
    let latest: GroupDoc | null = null;
    const actions: GroupActions = {
      currentUid: uid,
      addPerson: (p) => dbApi.addPerson(db, id, p),
      updateOwnVenmo: (venmo) => dbApi.updateOwnVenmo(db, id, uid, venmo),
      updateOwnName: (name) => dbApi.updateOwnName(db, id, uid, name),
      linkPerson: (pid) => dbApi.linkPersonToUser(db, id, pid, uid),
      removePerson: (pid) => dbApi.removePerson(db, id, pid),
      addExpense: (e) => dbApi.addExpense(db, id, e),
      updateExpense: (e) => dbApi.updateExpense(db, id, e),
      removeExpense: (eid) => dbApi.removeExpense(db, id, eid),
      addSettlement: (s) => dbApi.addSettlement(db, id, s),
      onBack: () => navigate("#/"),
      onCopyLink: () => navigator.clipboard.writeText(window.location.href),
      onTabChange: (t) => { tab = t; draw(); },
    };
    const draw = () => { if (latest) renderGroup(appEl, latest, actions, tab); };

    routeUnsub = dbApi.subscribeGroup(db, id, (group) => {
      if (!group) {
        mount(appEl, el("div", { class: "card empty" }, "Group not found."));
        return;
      }
      latest = group;
      draw();
    }, renderSubscriptionError);
  }

  authApi.watchAuth(auth, (user) => {
    currentUser = user;
    route();
  });

  window.addEventListener("hashchange", route);
}

function deriveName(user: User | null): string {
  const email = user?.email ?? "Me";
  return email.split("@")[0];
}
