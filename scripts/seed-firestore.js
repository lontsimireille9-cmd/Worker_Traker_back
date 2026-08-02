import { auth, db } from '../src/config/firebase.js';

const companyId = process.env.SEED_COMPANY_ID || 'demo-company';
const companyName = process.env.SEED_COMPANY_NAME || 'Entreprise Démo';
const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe123!';
const now = new Date();
const createdAt = now.toISOString();

const seedUsers = [
  { email: 'admin@demo.local', name: 'Admin Démo', role: 'SUPER_ADMIN' },
  { email: 'manager@demo.local', name: 'Manager Démo', role: 'MANAGER' },
  { email: 'employee@demo.local', name: 'Employé Démo', role: 'EMPLOYEE' },
];

async function findOrCreateAuthUser(seedUser) {
  try {
    return await auth.getUserByEmail(seedUser.email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }

    return auth.createUser({
      email: seedUser.email,
      password: defaultPassword,
      displayName: seedUser.name,
      emailVerified: true,
    });
  }
}

async function seedCompany() {
  await db.collection('companies').doc(companyId).set(
    {
      id: companyId,
      name: companyName,
      address: '1 rue de l\'Innovation',
      country: 'FR',
      phone: '+33102030405',
      email: 'contact@demo.local',
      ownerId: null,
      status: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
    },
    { merge: true }
  );
}

async function seedProfiles() {
  const profiles = [];

  for (const seedUser of seedUsers) {
    const authUser = await findOrCreateAuthUser(seedUser);
    const profile = {
      uid: authUser.uid,
      nom: seedUser.name.split(' ')[0] || seedUser.name,
      prenom: seedUser.name.split(' ').slice(1).join(' ') || '',
      email: seedUser.email,
      telephone: '',
      role: seedUser.role,
      companyId,
      teamId: null,
      department: seedUser.role === 'SUPER_ADMIN' ? 'Direction' : 'Production',
      status: 'ACTIVE',
      createdAt,
      updatedAt: createdAt,
      lastLogin: null,
      photoURL: null,
    };

    await db.collection('users').doc(authUser.uid).set(profile, { merge: true });
    profiles.push(profile);
  }

  return profiles;
}

async function seedEmployees(profiles) {
  const manager = profiles.find((profile) => profile.role === 'MANAGER');
  const employee = profiles.find((profile) => profile.role === 'EMPLOYEE');

  if (!manager || !employee) {
    return;
  }

  const teamRef = await db.collection('teams').add({
    name: 'Équipe Production',
    companyId,
    department: 'Production',
    leaderId: manager.uid,
    memberIds: [employee.uid],
    createdAt,
    updatedAt: createdAt,
  });

  await db.collection('users').doc(manager.uid).set({ teamId: teamRef.id, department: 'Production' }, { merge: true });
  await db.collection('users').doc(employee.uid).set({ teamId: teamRef.id, department: 'Production' }, { merge: true });

  await db.collection('projects').add({
    name: 'Projet d’initiation',
    companyId,
    teamId: teamRef.id,
    createdBy: manager.uid,
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    status: 'IN_PROGRESS',
    createdAt,
    updatedAt: createdAt,
  });

  await db.collection('employees').doc(employee.uid).set({
    uid: employee.uid,
    matricule: 'EMP-1001',
    companyId,
    role: 'EMPLOYEE',
    department: 'Production',
    position: 'Opérateur',
    hireDate: createdAt,
    status: 'ACTIVE',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });

  await db.collection('matricules').doc('EMP-1001').set({
    uid: employee.uid,
    email: employee.email,
    companyId,
    createdAt,
  }, { merge: true });

  await db.collection('employees').doc(manager.uid).set({
    uid: manager.uid,
    matricule: 'MGR-1001',
    companyId,
    role: 'MANAGER',
    department: 'Direction',
    position: 'Manager',
    hireDate: createdAt,
    status: 'ACTIVE',
    createdAt,
    updatedAt: createdAt,
  }, { merge: true });
}

async function seedTasks(profiles) {
  const manager = profiles.find((profile) => profile.role === 'MANAGER');
  const employee = profiles.find((profile) => profile.role === 'EMPLOYEE');

  if (!manager || !employee) {
    return;
  }

  const projectSnap = await db.collection('projects').limit(1).get();
  const project = projectSnap.docs[0];

  await db.collection('tasks').doc(`seed-task-${employee.uid}`).set(
    {
      title: 'Découvrir le tableau de bord',
      description: 'Tester la connexion, le pointage et le suivi des tâches.',
      priority: 'MEDIUM',
      status: 'TODO',
      assigneeId: employee.uid,
      createdBy: manager.uid,
      companyId,
      projectId: project?.id || null,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      createdAt,
      updatedAt: createdAt,
      statusHistory: [{ status: 'TODO', changedAt: createdAt, changedBy: manager.uid }],
    },
    { merge: true }
  );

  await db.collection('attendance').doc(`${employee.uid}_${new Date().toISOString().slice(0, 10)}`).set({
    userId: employee.uid,
    companyId,
    date: new Date().toISOString().slice(0, 10),
    clockIn: new Date().toISOString(),
    status: 'PRESENT',
    location: null,
  }, { merge: true });
}

async function main() {
  await seedCompany();
  const profiles = await seedProfiles();
  await seedEmployees(profiles);
  await seedTasks(profiles);

  console.log('Base Firestore initialisée.');
  console.table(
    profiles.map((profile) => ({
      email: profile.email,
      role: profile.role,
      password: defaultPassword,
      uid: profile.uid,
    }))
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
