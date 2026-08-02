import { auth, db } from '../config/firebase.js';
import { ROLES } from '../constants/roles.js';
import { sendError } from '../utils/response.js';
import { updateLastLoginService } from '../services/auth.service.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

  if (!token) {
    return sendError(res, 401, 'Authentification requise');
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decoded.uid).get();

    if (!userDoc.exists) {
      const firebaseUser = await auth.getUser(decoded.uid);
      const now = new Date();
      const fallbackProfile = {
        uid: decoded.uid,
        nom: String(firebaseUser.displayName || '').trim().split(' ')[0] || '',
        prenom: String(firebaseUser.displayName || '').trim().split(' ').slice(1).join(' ') || '',
        email: firebaseUser.email || '',
        telephone: '',
        role: ROLES.EMPLOYEE,
        companyId: null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        lastLogin: now,
        photoURL: firebaseUser.photoURL || null,
      };

      await db.collection('users').doc(decoded.uid).set(fallbackProfile, { merge: true });
      req.user = { uid: decoded.uid, ...fallbackProfile };
      await updateLastLoginService(decoded.uid);
      return next();
    }

    req.user = { uid: decoded.uid, ...userDoc.data() };
    await updateLastLoginService(decoded.uid);
    next();
  } catch (error) {
    return sendError(res, 401, 'Token invalide ou expiré');
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, 'Accès refusé pour ce rôle');
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  return requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN)(req, res, next);
}

export function requireManager(req, res, next) {
  return requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER)(req, res, next);
}

export function requireEmployee(req, res, next) {
  return requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE)(req, res, next);
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Erreur interne';
  const payload = { success: false, message };

  if (process.env.NODE_ENV === 'development') {
    payload.details = err.stack;
  }

  return res.status(status).json(payload);
}

export function logger(req, res, next) {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
}

export function rateLimiter(windowMs = 15 * 60 * 1000, max = 100) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    if (!globalThis.__rateLimitMap) {
      globalThis.__rateLimitMap = new Map();
    }
    const entry = globalThis.__rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    globalThis.__rateLimitMap.set(key, entry);
    if (entry.count > max) {
      return sendError(res, 429, 'Trop de requêtes');
    }
    next();
  };
}
