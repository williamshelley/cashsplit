import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";

// Set VITE_USE_EMULATOR=1 to run against the local Firebase Emulator Suite
// instead of the real project (handy for development and testing).
const useEmulator = (import.meta as ImportMeta).env?.VITE_USE_EMULATOR === "1";

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);

// Enable offline persistence in the browser; fall back gracefully elsewhere.
export const db: Firestore = (() => {
  if (useEmulator) return getFirestore(app);
  if (typeof window !== "undefined") {
    try {
      return initializeFirestore(app, { localCache: persistentLocalCache() });
    } catch {
      return getFirestore(app);
    }
  }
  return getFirestore(app);
})();

if (useEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
