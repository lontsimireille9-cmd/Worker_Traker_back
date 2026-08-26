import { db } from "../config/firebase.js";

export async function createProfile(uid, name, email) {
  const ref = db.collection("users").doc(uid);
  const now = new Date().toISOString();

  const existing = await ref.get();
  if (existing.exists) {
    return {
      uid,
      ...existing.data(),
    };
  }

  const profile = {
    uid,
    name: name.trim(),
    email: email || null,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(profile);
  return profile;
}
