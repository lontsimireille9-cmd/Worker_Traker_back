import { db } from '../config/firebase.js';

function todayId(uid) {
  const today = new Date().toISOString().slice(0, 10);
  return `${uid}_${today}`;
}

export async function clockInService(user, location) {
  if (user.role === 'SUPER_ADMIN') {
    throw Object.assign(new Error('Le super administrateur ne pointe pas son arrivée'), { status: 403 });
  }

  const uid = user.uid;
  const docId = todayId(uid);
  const ref = db.collection('attendance').doc(docId);
  const existing = await ref.get();

  if (existing.exists && existing.data().clockIn) {
    throw Object.assign(new Error('Déjà pointé aujourd\'hui'), { status: 409 });
  }

  const now = new Date();
  const startHour = 9;
  const status = now.getHours() > startHour || (now.getHours() === startHour && now.getMinutes() > 0) ? 'LATE' : 'PRESENT';

  await ref.set({
    userId: uid,
    companyId: user.companyId || null,
    date: now.toISOString().slice(0, 10),
    clockIn: now.toISOString(),
    status,
    location: location || null,
  }, { merge: true });

  return { status };
}

export async function clockOutService(user) {
  if (user.role === 'SUPER_ADMIN') {
    throw Object.assign(new Error('Le super administrateur ne pointe pas son départ'), { status: 403 });
  }

  const uid = user.uid;
  const ref = db.collection('attendance').doc(todayId(uid));
  const existing = await ref.get();

  if (!existing.exists || !existing.data().clockIn) {
    throw Object.assign(new Error('Aucun pointage d\'arrivée trouvé pour aujourd\'hui'), { status: 400 });
  }

  const now = new Date();
  await ref.set({ clockOut: now.toISOString() }, { merge: true });
  return { success: true };
}

export async function myAttendanceService(user) {
  const snap = await db.collection('attendance').where('userId', '==', user.uid).get();
  const attendance = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return attendance.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);
}

export async function teamAttendanceService(user, date) {
  const selectedDate = date || new Date().toISOString().slice(0, 10);
  let query = db.collection('attendance').where('date', '==', selectedDate);

  if (user.role !== 'SUPER_ADMIN') {
    if (!user.companyId) {
      throw Object.assign(new Error('Entreprise non configurée pour cet utilisateur'), { status: 403 });
    }
    query = query.where('companyId', '==', user.companyId);
  }

  const snap = await query.get();
  const attendance = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const companyId = user.companyId || null;
  const usersSnap = companyId ? await db.collection('users').where('companyId', '==', companyId).get() : await db.collection('users').get();
  const users = usersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })).filter((entry) => entry.role !== 'SUPER_ADMIN');
  const attendanceByUser = Object.fromEntries(attendance.map((entry) => [entry.userId, entry]));

  return users.map((entry) => {
    const record = attendanceByUser[entry.uid];
    const fullName = [entry.prenom, entry.nom].filter(Boolean).join(' ').trim();
    return {
      uid: entry.uid,
      name: fullName || entry.email || entry.uid,
      role: entry.role,
      status: record ? (record.status || 'PRESENT') : 'ABSENT',
      clockIn: record?.clockIn || null,
      clockOut: record?.clockOut || null,
      date: selectedDate,
    };
  });
}
