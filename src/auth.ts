import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

/** Create an account and immediately send a verification email. */
export async function signUp(auth: Auth, email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function logIn(auth: Auth, email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logOut(auth: Auth): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(auth: Auth, email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/** Re-send the verification email to the currently signed-in user. */
export async function resendVerification(auth: Auth): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in.");
  await sendEmailVerification(auth.currentUser);
}

/** Subscribe to auth state changes. */
export function watchAuth(auth: Auth, onChange: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, onChange);
}

export function isVerified(user: User | null): boolean {
  return !!user && user.emailVerified;
}
