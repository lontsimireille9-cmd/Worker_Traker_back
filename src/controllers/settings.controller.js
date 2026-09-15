import { db } from "../config/firebase.js";

const DEFAULT_THEME = { primary: "#0B4F8A", primaryDark: "#06345D", accent: "#2F80ED", background: "#F4F8FC", surface: "#FFFFFF", text: "#16324F", font: "Inter" };
const ALLOWED_FONTS = ["Inter", "Manrope", "DM Sans", "Plus Jakarta Sans", "Roboto"];
const COLOR_KEYS = ["primary", "primaryDark", "accent", "background", "surface", "text"];

export async function getSettings(req, res, next) {
  try {
    const snap = await db.collection("users").doc(req.user.uid).get();
    return res.json({ theme: { ...DEFAULT_THEME, ...(snap.data()?.settings?.theme || {}) } });
  } catch (error) {
    next(error);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const input = req.body?.theme || {};
    const current = await db.collection("users").doc(req.user.uid).get();
    const theme = { ...DEFAULT_THEME, ...(current.data()?.settings?.theme || {}) };
    for (const key of COLOR_KEYS) {
      if (typeof input[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(input[key])) theme[key] = input[key];
    }
    if (ALLOWED_FONTS.includes(input.font)) theme.font = input.font;
    await db.collection("users").doc(req.user.uid).set({ settings: { theme }, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ theme });
  } catch (error) {
    next(error);
  }
}
