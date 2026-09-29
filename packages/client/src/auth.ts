import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import type { FirebaseClient } from './firebase';

export async function signInWithEmail(client: FirebaseClient, email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(client.auth, email, password);
}

/** Web only: native Google sign-in needs an EAS dev build (see m3-followups.md). */
export async function signInWithGoogle(client: FirebaseClient): Promise<void> {
  await signInWithPopup(client.auth, new GoogleAuthProvider());
}

export async function signOutUser(client: FirebaseClient): Promise<void> {
  await signOut(client.auth);
}

export function currentIdToken(client: FirebaseClient): Promise<string | null> {
  const user = client.auth.currentUser;
  return user ? user.getIdToken() : Promise.resolve(null);
}
