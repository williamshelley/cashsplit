import { el, mount } from "./dom";

export interface AuthActions {
  signUp: (email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

type Mode = "login" | "signup" | "forgot";

/** Render the signed-out auth screen (login / signup / forgot password). */
export function renderAuth(container: HTMLElement, actions: AuthActions): void {
  let mode: Mode = "login";

  const render = () => {
    const email = el("input", { type: "email", placeholder: "you@example.com", autocomplete: "email" });
    const password = el("input", {
      type: "password",
      placeholder: "Password (6+ characters)",
      autocomplete: mode === "signup" ? "new-password" : "current-password",
    });
    const msg = el("div", { class: "error" });
    const submit = el("button", { class: "btn primary", type: "submit" },
      mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset email");

    const onSubmit = async (e: Event) => {
      e.preventDefault();
      msg.className = "error";
      msg.textContent = "";
      submit.setAttribute("disabled", "true");
      try {
        if (mode === "forgot") {
          await actions.resetPassword(email.value.trim());
          msg.className = "ok";
          msg.textContent = "Password reset email sent. Check your inbox.";
        } else if (mode === "signup") {
          await actions.signUp(email.value.trim(), password.value);
        } else {
          await actions.logIn(email.value.trim(), password.value);
        }
      } catch (err) {
        msg.className = "error";
        msg.textContent = friendlyError(err);
      } finally {
        submit.removeAttribute("disabled");
      }
    };

    const fields = [el("label", {}, "Email"), email];
    if (mode !== "forgot") fields.push(el("label", {}, "Password"), password);

    const form = el("form", { class: "stack", onSubmit }, [...fields, submit, msg]);

    const switcher = el("div", { class: "row wrap", style: "margin-top:12px" }, [
      mode !== "login"
        ? el("button", { class: "btn small", onClick: () => { mode = "login"; render(); } }, "Log in")
        : null,
      mode !== "signup"
        ? el("button", { class: "btn small", onClick: () => { mode = "signup"; render(); } }, "Sign up")
        : null,
      mode !== "forgot"
        ? el("button", { class: "btn small", onClick: () => { mode = "forgot"; render(); } }, "Forgot password?")
        : null,
    ]);

    mount(
      container,
      el("div", { class: "topbar" }, [el("div", { class: "brand" }, [el("span", {}, "Cash"), "Split"])]),
      el("div", { class: "card" }, [
        el("h2", {}, mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset password" : "Welcome back"),
        el("p", { class: "hint" }, "Track shared expenses and settle up with Venmo."),
        form,
        switcher,
      ]),
    );
  };

  render();
}

/** Render the "please verify your email" gate. */
export function renderVerify(
  container: HTMLElement,
  email: string,
  actions: { resend: () => Promise<void>; reload: () => Promise<void>; logOut: () => Promise<void> },
): void {
  const msg = el("div", { class: "ok" });
  mount(
    container,
    el("div", { class: "card center stack" }, [
      el("h2", {}, "Verify your email"),
      el("p", { class: "hint" }, [`We sent a verification link to `, el("strong", {}, email), `. Click it, then continue.`]),
      el("div", { class: "row", style: "justify-content:center;gap:8px;flex-wrap:wrap" }, [
        el("button", { class: "btn primary", onClick: async () => { await actions.reload(); } }, "I've verified — continue"),
        el("button", {
          class: "btn",
          onClick: async () => {
            try { await actions.resend(); msg.textContent = "Verification email re-sent."; }
            catch { msg.textContent = ""; }
          },
        }, "Resend email"),
        el("button", { class: "btn", onClick: async () => { await actions.logOut(); } }, "Log out"),
      ]),
      msg,
    ]),
  );
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "That email is already registered. Try logging in.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email.";
    default:
      return (err as Error)?.message ?? "Something went wrong.";
  }
}
