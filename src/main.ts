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

  let routeUnsub: Unsubscribe | null = null;
  let currentUser: User | null = null;

  const clearRoute = () => {
    if (routeUnsub) { routeUnsub(); routeUnsub = null; }
  };

  const navigate = (hash: string) => {
    if (window.location.hash !== hash) window.location.hash = hash;
    else route();
  };

  function route() {
    clearRoute();
    const screen = authScreen(currentUser);
    if (screen === "auth") {
      renderAuth(appEl, {
        signUp: async (email, password) => { await authApi.signUp(auth, email, password); },
        logIn: async (email, password) => { await authApi.logIn(auth, email, password); },
        resetPassword: async (email) => { await authApi.resetPassword(auth, email); },
      });
      return;
    }
    if (screen === "verify") {
      renderVerify(appEl, currentUser?.email ?? "your email", {
        resend: async () => { await authApi.resendVerification(auth); },
        reload: async () => {
          await currentUser?.reload();
          // Force a fresh ID token so the email_verified claim is updated for
          // Firestore rules (reload alone reuses the cached, still-false token).
          await auth.currentUser?.getIdToken(true);
          currentUser = auth.currentUser;
          route();
        },
        logOut: async () => { await authApi.logOut(auth); },
      });
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
