import { auth, db } from '../config/firebase.js';
import { ROLES } from '../constants/roles.js';
import { sendError } from '../utils/response.js';
import { updateLastLoginService } from '../services/auth.service.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7).trim()
    : null;

  if (!token) {
    return sendError(res, 401, 'Authentification requise');
  }

  try {
    const decoded = await auth.verifyIdToken(token);

    const userRef = db.collection('users').doc(decoded.uid);
    const userDoc = await userRef.get();

    /*
     * Le rôle métier de l'application vient de Firestore.
     * Il ne faut PAS utiliser un rôle conservé dans le token Firebase,
     * car un changement EMPLOYEE -> MANAGER peut avoir lieu alors
     * que le token Firebase est encore valide.
     */
    if (!userDoc.exists) {
      const firebaseUser = await auth.getUser(decoded.uid);
      const now = new Date();

      const fallbackProfile = {
        uid: decoded.uid,
        nom:
          String(firebaseUser.displayName || '')
            .trim()
            .split(' ')[0] || '',
        prenom:
          String(firebaseUser.displayName || '')
            .trim()
            .split(' ')
            .slice(1)
            .join(' ') || '',
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

      await userRef.set(fallbackProfile, { merge: true });

      req.user = {
        uid: decoded.uid,
        ...fallbackProfile,
      };

      updateLastLoginService(decoded.uid).catch(() => undefined);

      return next();
    }

    const profile = userDoc.data() || {};

    /*
     * Toujours utiliser le profil Firestore actuel.
     * Ainsi, si le SUPER_ADMIN vient de transformer
     * l'utilisateur en MANAGER, les middlewares de permissions
     * le verront comme MANAGER dès la prochaine requête.
     */
    req.user = {
      uid: decoded.uid,
      ...profile,
      role: String(profile.role || ROLES.EMPLOYEE).trim().toUpperCase(),
    };

    updateLastLoginService(decoded.uid).catch(() => undefined);

    return next();
  } catch (error) {
    console.error('requireAuth:', error);

    return sendError(
      res,
      401,
      'Token invalide ou expiré'
    );
  }
}

export function requireRole(...roles) {
  const normalizedRoles = roles.map((role) =>
    String(role).trim().toUpperCase()
  );

  return (req, res, next) => {
    const currentRole = String(req.user?.role || '')
      .trim()
      .toUpperCase();

    if (!currentRole || !normalizedRoles.includes(currentRole)) {
      return sendError(
        res,
        403,
        'Accès refusé pour ce rôle'
      );
    }

    next();
  };
}

export function requireAdmin(req, res, next) {
  return requireRole(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN
  )(req, res, next);
}

export function requireManager(req, res, next) {
  return requireRole(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER
  )(req, res, next);
}

export function requireEmployee(req, res, next) {
  return requireRole(
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
    ROLES.EMPLOYEE
  )(req, res, next);
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Erreur interne';

  const payload = {
    success: false,
    message,
  };

  if (process.env.NODE_ENV === 'development') {
    payload.details = err.stack;
  }

  return res.status(status).json(payload);
}

export function logger(req, res, next) {
  console.log(
    `${new Date().toISOString()} ${req.method} ${req.originalUrl}`
  );

  next();
}

export function rateLimiter(
  windowMs = 15 * 60 * 1000,
  max = 100
) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';

    if (!globalThis.__rateLimitMap) {
      globalThis.__rateLimitMap = new Map();
    }

    const entry =
      globalThis.__rateLimitMap.get(key) || {
        count: 0,
        resetAt: now + windowMs,
      };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;

    globalThis.__rateLimitMap.set(key, entry);

    if (entry.count > max) {
      return sendError(
        res,
        429,
        'Trop de requêtes'
      );
    }

    next();
  };
}