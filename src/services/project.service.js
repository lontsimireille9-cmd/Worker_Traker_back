import { db } from "../config/firebase.js";
import { audit } from "./audit.service.js";
import { calculateWeightedProgress } from "./kpi.service.js";

const managerRoles = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const clean = (value) =>
  String(value ?? "").trim();

const num = (value, fallback = 0) => {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
};

const now = () =>
  new Date().toISOString();

async function assertCompanyUser(user, uid) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .get();

  if (
    !snap.exists ||
    snap.data().companyId !== user.companyId
  ) {
    throw fail(
      "Utilisateur hors de votre entreprise",
      400
    );
  }

  return {
    uid,
    ...snap.data(),
  };
}

async function assertProject(user, projectId) {
  const snap = await db
    .collection("projects")
    .doc(projectId)
    .get();

  if (
    !snap.exists ||
    snap.data().companyId !== user.companyId
  ) {
    throw fail(
      "Projet introuvable ou accès refusé",
      404
    );
  }

  const project = {
    id: snap.id,
    ...snap.data(),
  };

  // Les rôles de gestion ont accès à tous les projets de leur entreprise.
  if (managerRoles.has(user.role)) {
    return project;
  }

  // Un membre d'équipe doit pouvoir ouvrir le projet dès qu'il est
  // rattaché à l'une des équipes responsables, même sans tâche assignée.
  const projectTeamsSnap = await db
    .collection("projectTeams")
    .where("projectId", "==", projectId)
    .where("companyId", "==", user.companyId)
    .get();

  if (projectTeamsSnap.empty) {
    throw fail(
      "Projet introuvable ou accès refusé",
      404
    );
  }

  const teamIds = [
    ...new Set(
      projectTeamsSnap.docs
        .map((doc) => doc.data().teamId)
        .filter(Boolean)
    ),
  ];

  const teamSnaps = await Promise.all(
    teamIds.map((teamId) =>
      db.collection("teams").doc(String(teamId)).get()
    )
  );

  const isMember = teamSnaps.some((teamSnap) => {
    if (!teamSnap.exists) return false;

    const team = teamSnap.data();
    const memberIds = Array.isArray(team.memberIds)
      ? team.memberIds.map(String)
      : [];

    return (
      String(team.leaderId || "") === String(user.uid) ||
      memberIds.includes(String(user.uid))
    );
  });

  if (!isMember) {
    throw fail(
      "Projet introuvable ou accès refusé",
      404
    );
  }

  return project;
}

/**
 * Normalise les équipes reçues lors de la création.
 *
 * Formats acceptés :
 *
 * teamIds: ["team1", "team2"]
 *
 * ou :
 *
 * teams: [
 *   { teamId: "team1", weight: 50 },
 *   { teamId: "team2", weight: 50 }
 * ]
 */
function normalizeProjectTeams(payload) {
  let rawTeams = [];

  if (Array.isArray(payload?.teams)) {
    rawTeams = payload.teams;
  } else if (Array.isArray(payload?.teamIds)) {
    rawTeams = payload.teamIds.map((teamId) => ({
      teamId,
    }));
  }

  const normalized = rawTeams
    .map((item) => {
      if (typeof item === "string") {
        return {
          teamId: item,
          weight: null,
        };
      }

      return {
        teamId: clean(item?.teamId),
        weight:
          item?.weight === undefined ||
          item?.weight === null ||
          item?.weight === ""
            ? null
            : num(item.weight),
      };
    })
    .filter((item) => item.teamId);

  /*
   * Suppression des doublons.
   */
  const unique = [];
  const seen = new Set();

  for (const item of normalized) {
    if (seen.has(item.teamId)) {
      continue;
    }

    seen.add(item.teamId);
    unique.push(item);
  }

  return unique;
}

/**
 * Vérifie les équipes et calcule les poids.
 *
 * Si aucun poids n'est fourni :
 *
 * 1 équipe  -> 100 %
 * 2 équipes -> 50 / 50
 * 3 équipes -> 33.33 / 33.33 / 33.34
 *
 * Le total reste toujours 100 %.
 */
async function prepareProjectTeams(
  user,
  payload
) {
  const requestedTeams =
    normalizeProjectTeams(payload);

  if (!requestedTeams.length) {
    return [];
  }

  const teamSnapshots = await Promise.all(
    requestedTeams.map((item) =>
      db.collection("teams")
        .doc(item.teamId)
        .get()
    )
  );

  const invalidIndex =
    teamSnapshots.findIndex(
      (snap) =>
        !snap.exists ||
        snap.data().companyId !== user.companyId
    );

  if (invalidIndex !== -1) {
    throw fail(
      "Une des équipes sélectionnées est introuvable ou n'appartient pas à votre entreprise",
      400
    );
  }

  const teams = teamSnapshots.map(
    (snap, index) => ({
      teamId: requestedTeams[index].teamId,
      weight: requestedTeams[index].weight,
      data: snap.data(),
    })
  );

  const explicitWeights = teams.every(
    (team) =>
      Number.isFinite(team.weight) &&
      team.weight > 0
  );

  /*
   * Aucun poids fourni :
   * répartition automatique.
   */
  if (!explicitWeights) {
    const base =
      Math.floor((100 / teams.length) * 100) / 100;

    let remaining = 100;

    return teams.map((team, index) => {
      const weight =
        index === teams.length - 1
          ? Number(remaining.toFixed(2))
          : Number(base.toFixed(2));

      remaining -= weight;

      return {
        teamId: team.teamId,
        weight,
        data: team.data,
      };
    });
  }

  /*
   * Tous les poids ont été explicitement fournis.
   */
  const total = teams.reduce(
    (sum, team) => sum + Number(team.weight),
    0
  );

  if (Math.abs(total - 100) > 0.01) {
    throw fail(
      `Le poids des équipes doit être égal à 100 %. Total reçu : ${total} %`,
      400
    );
  }

  return teams.map((team) => ({
    teamId: team.teamId,
    weight: Number(team.weight),
    data: team.data,
  }));
}

export async function createProjectService(
  user,
  payload
) {
  if (!managerRoles.has(user.role)) {
    throw fail(
      "Droits insuffisants",
      403
    );
  }

  if (!user.companyId) {
    throw fail(
      "Créez d'abord votre entreprise"
    );
  }

  const name = clean(payload.name);

  if (!name) {
    throw fail(
      "Nom du projet requis"
    );
  }

  /*
   * Préparation des équipes AVANT la création.
   *
   * Cela évite de créer un projet incomplet si
   * une équipe sélectionnée est invalide.
   */
  const projectTeams =
    await prepareProjectTeams(
      user,
      payload
    );

  if (!projectTeams.length) {
    throw fail(
      "Un projet doit être rattaché à au moins une équipe. Sélectionnez une équipe avant de créer le projet.",
      400
    );
  }

  const timestamp = now();

  const project = {
    name,

    description:
      clean(payload.description),

    objective:
      clean(payload.objective),

    companyId:
      user.companyId,

    createdBy:
      user.uid,

    managerId:
      payload.managerId || user.uid,

    // Un projet créé est immédiatement structurable par son créateur
    // et par le SUPER_ADMIN. Le frontend ne dépend plus d’un champ
    // approvalStatus absent des anciens projets.
    approvalStatus:
      user.role === "MANAGER" ? "APPROVED" : "APPROVED",

    priority:
      clean(
        payload.priority || "MEDIUM"
      ).toUpperCase(),

    status:
      "DRAFT",

    startDate:
      payload.startDate || null,

    plannedEndDate:
      payload.plannedEndDate ||
      payload.deadline ||
      null,

    actualEndDate:
      null,

    totalWeight:
      projectTeams.reduce(
        (sum, team) =>
          sum + Number(team.weight || 0),
        0
      ),

    version:
      1,

    createdAt:
      timestamp,

    updatedAt:
      timestamp,
  };

  /*
   * Création du projet.
   */
  const projectRef =
    await db
      .collection("projects")
      .add(project);

  /*
   * Création de la version.
   */
  const versionRef =
    await db
      .collection("projectVersions")
      .add({
        projectId:
          projectRef.id,

        companyId:
          user.companyId,

        version:
          1,

        reason:
          "Création du projet",

        snapshot:
          project,

        createdBy:
          user.uid,

        createdAt:
          timestamp,
      });

  /*
   * Toutes les relations projet-équipe sont créées
   * dans une seule opération Firestore.
   *
   * Cela évite plusieurs requêtes HTTP depuis le frontend.
   */
  if (projectTeams.length) {
    const batch =
      db.batch();

    for (const team of projectTeams) {
      const ref =
        db.collection(
          "projectTeams"
        ).doc();

      const teamManagerId =
        team.data.leaderId || team.data.managerId || null;

      const teamMemberIds = [
        ...new Set([
          ...(Array.isArray(team.data.memberIds)
            ? team.data.memberIds
            : []),
          ...(teamManagerId ? [teamManagerId] : []),
        ]),
      ];

      batch.set(ref, {
        projectId: projectRef.id,
        companyId: user.companyId,
        teamId: team.teamId,
        name: team.data.name,
        weight: team.weight,

        // Le responsable du projet pour cette équipe est
        // toujours le responsable (leader) de l'équipe.
        managerId: teamManagerId,

        // Snapshot utile pour le workflow et les lectures rapides.
        memberIds: teamMemberIds,

        status: "ACTIVE",
        createdBy: user.uid,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    await batch.commit();
  }

  /*
   * Mise à jour du projet avec sa version courante.
   */
  await projectRef.update({
    currentVersionId:
      versionRef.id,
  });

  await audit(
    user,
    "PROJECT_CREATED",
    "project",
    projectRef.id,
    {
      name,
      teamCount:
        projectTeams.length,
      teamIds:
        projectTeams.map(
          (team) => team.teamId
        ),
    }
  );

  return {
    id:
      projectRef.id,

    ...project,

    currentVersionId:
      versionRef.id,

    teams:
      projectTeams.map(
        (team) => ({
          teamId:
            team.teamId,

          name:
            team.data.name,

          weight:
            team.weight,
        })
      ),
  };
}

export async function listProjectsService(
  user
) {
  if (!user.companyId) {
    return [];
  }

  const [
    pSnap,
    tSnap,
    teamSnap,
    sSnap,
    taskSnap,
  ] = await Promise.all([
    db.collection("projects")
      .where("companyId", "==", user.companyId)
      .get(),

    db.collection("projectTeams")
      .where("companyId", "==", user.companyId)
      .get(),

    db.collection("teams")
      .where("companyId", "==", user.companyId)
      .get(),

    db.collection("projectSections")
      .where("companyId", "==", user.companyId)
      .get(),

    db.collection("tasks")
      .where("companyId", "==", user.companyId)
      .get(),
  ]);

  const projects =
    pSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  const projectTeams =
    tSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  const companyTeams =
    teamSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  const sections =
    sSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  const tasks =
    taskSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  let visible = projects;

  if (!managerRoles.has(user.role)) {
    // Un membre d'équipe voit le projet dès son rattachement à l'équipe,
    // même si aucune tâche ne lui a encore été assignée.
    const myTeamIds = new Set(
      companyTeams
        .filter((team) => {
          const memberIds = Array.isArray(team.memberIds)
            ? team.memberIds.map(String)
            : [];

          return (
            String(team.leaderId || "") === String(user.uid) ||
            memberIds.includes(String(user.uid))
          );
        })
        .map((team) => String(team.id))
    );

    const projectIdsVisible = new Set(
      projectTeams
        .filter((relation) => myTeamIds.has(String(relation.teamId)))
        .map((relation) => String(relation.projectId))
    );

    visible = projects.filter((project) =>
      projectIdsVisible.has(String(project.id))
    );
  }

  return visible.map((project) => {
      const projectTeamRelations =
        projectTeams.filter(
          (relation) =>
            relation.projectId === project.id
        );

      const projectSections =
        sections.filter(
          (section) =>
            section.projectId ===
            project.id
        );

      const projectTasks =
        tasks.filter(
          (task) =>
            task.projectId === project.id
        );

      return {
        ...project,

        // Les relations sont exposées sous "teams" pour que le frontend
        // puisse afficher les équipes responsables.
        teams: projectTeamRelations,

        progress:
          calculateWeightedProgress(
            project,
            projectTeams,
            projectSections,
            projectTasks
          ),

        taskCount:
          projectTasks.length,

        validatedTaskCount:
          projectTasks.filter(
            (task) =>
              [
                "VALIDATED",
                "COMPLETED",
              ].includes(task.status)
          ).length,

        teamCount:
          projectTeams.length,
      };
    }
  );
}

export async function getProjectService(
  user,
  projectId
) {
  const project = await assertProject(user, projectId);

  const [
    teamsSnap,
    sectionsSnap,
    tasksSnap,
  ] = await Promise.all([
    db.collection("projectTeams")
      .where("projectId", "==", projectId)
      .get(),
    db.collection("projectSections")
      .where("projectId", "==", projectId)
      .get(),
    db.collection("tasks")
      .where("projectId", "==", projectId)
      .get(),
  ]);

  const rawTeams = teamsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const sections = sectionsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  let tasks = tasksSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const companyTeamIds = [
    ...new Set(rawTeams.map((team) => String(team.teamId)).filter(Boolean)),
  ];

  const companyTeamSnaps = await Promise.all(
    companyTeamIds.map((teamId) =>
      db.collection("teams").doc(teamId).get()
    )
  );

  const companyTeams = new Map(
    companyTeamSnaps
      .filter((snap) => snap.exists)
      .map((snap) => [String(snap.id), { id: snap.id, ...snap.data() }])
  );

  const teams = rawTeams.map((relation) => {
    const sourceTeam = companyTeams.get(String(relation.teamId));
    const memberIds = [
      ...new Set([
        ...(Array.isArray(sourceTeam?.memberIds) ? sourceTeam.memberIds : []),
        ...(Array.isArray(relation.memberIds) ? relation.memberIds : []),
        ...(relation.managerId ? [relation.managerId] : []),
        ...(sourceTeam?.leaderId ? [sourceTeam.leaderId] : []),
        ...(sourceTeam?.managerId ? [sourceTeam.managerId] : []),
      ].filter(Boolean).map(String)),
    ];

    return {
      ...relation,
      teamId: relation.teamId || null,
      // Le manager du projet est défini par la relation projectTeams.
      // Ne pas le remplacer par le leader historique de l'équipe.
      managerId:
        relation.managerId ||
        sourceTeam?.managerId ||
        sourceTeam?.leaderId ||
        null,
      memberIds,
      members: memberIds.map((uid) => ({ uid })),
      sourceTeamId: sourceTeam?.id || relation.teamId || null,
    };
  });

  // Pour l’affichage du responsable de section, charger les profils uniquement
  // des personnes réellement rattachées aux équipes du projet.
  const memberIds = [
    ...new Set(
      teams.flatMap((team) => team.memberIds || []).map(String)
    ),
  ];

  // Les employés sont enregistrés dans `employees`, tandis que les
  // informations d'authentification/profil sont dans `users`.
  // Les anciennes versions de cette méthode ne lisaient que `users`,
  // ce qui pouvait produire `members: []` même lorsque l'équipe contenait
  // bien les UID des employés. On fusionne donc les deux sources.
  const [userSnaps, employeeSnaps] = await Promise.all([
    Promise.all(
      memberIds.map((uid) =>
        db.collection("users").doc(uid).get()
      )
    ),
    Promise.all(
      memberIds.map((uid) =>
        db.collection("employees").doc(uid).get()
      )
    ),
  ]);

  const users = new Map();

  memberIds.forEach((uid, index) => {
    const userData = userSnaps[index]?.exists
      ? userSnaps[index].data() || {}
      : {};

    const employeeData = employeeSnaps[index]?.exists
      ? employeeSnaps[index].data() || {}
      : {};

    // Si aucun document n'existe, on ignore réellement l'UID.
    if (!userSnaps[index]?.exists && !employeeSnaps[index]?.exists) {
      return;
    }

    const firstName =
      userData.prenom ||
      employeeData.prenom ||
      "";

    const lastName =
      userData.nom ||
      employeeData.nom ||
      "";

    const name =
      userData.name ||
      employeeData.name ||
      [lastName, firstName].filter(Boolean).join(" ").trim() ||
      userData.displayName ||
      employeeData.displayName ||
      userData.email ||
      employeeData.email ||
      userData.matricule ||
      employeeData.matricule ||
      uid;

    users.set(String(uid), {
      uid: String(uid),
      id: String(uid),
      userId: String(uid),
      name,
      displayName: userData.displayName || name,
      fullName: name,
      email: userData.email || employeeData.email || "",
      matricule: userData.matricule || employeeData.matricule || "",
      role: userData.role || employeeData.role || "EMPLOYEE",
      teamId: userData.teamId || employeeData.teamId || null,
      department:
        userData.department ||
        employeeData.department ||
        "",
      position:
        userData.position ||
        employeeData.position ||
        "",
      photoURL:
        userData.photoURL ||
        employeeData.photoURL ||
        null,
    });
  });

  const enrichedTeams = teams.map((team) => ({
    ...team,
    members: (team.memberIds || [])
      .map((uid) => users.get(String(uid)))
      .filter(Boolean),
    sections: sections
      .filter((section) => section.projectTeamId === team.id)
      .map((section) => ({
        ...section,
        assigneeId: section.assigneeId || null,
        assignee: section.assigneeId
          ? users.get(String(section.assigneeId)) || null
          : null,
        tasks: tasks.filter((task) => task.sectionId === section.id),
      })),
  }));

  if (!managerRoles.has(user.role)) {
    const managedTeamIds = new Set(
      teams
        .filter((relation) =>
          String(relation.managerId || "") === String(user.uid)
        )
        .map((relation) => String(relation.teamId))
    );

    if (managedTeamIds.size > 0) {
      tasks = tasks.filter((task) =>
        task.assigneeId === user.uid ||
        (task.teamId && managedTeamIds.has(String(task.teamId)))
      );
    } else {
      tasks = tasks.filter((task) => task.assigneeId === user.uid);
    }
  }

  return {
    ...project,
    approvalStatus: project.approvalStatus || "APPROVED",
    teams: enrichedTeams.map((team) => ({
      ...team,
      sections: team.sections.map((section) => ({
        ...section,
        tasks: section.tasks.filter((task) =>
          tasks.some((visibleTask) => visibleTask.id === task.id)
        ),
      })),
    })),
    tasks,
    progress: calculateWeightedProgress(
      project,
      teams,
      sections,
      tasks
    ),
  };
}

export async function addProjectTeamService(
  user,
  projectId,
  payload
) {
  if (!managerRoles.has(user.role)) {
    throw fail(
      "Droits insuffisants",
      403
    );
  }

  const project =
    await assertProject(
      user,
      projectId
    );

  const teamId =
    clean(payload.teamId);

  if (!teamId) {
    throw fail(
      "Équipe requise"
    );
  }

  const teamSnap =
    await db
      .collection("teams")
      .doc(teamId)
      .get();

  if (
    !teamSnap.exists ||
    teamSnap.data().companyId !==
      user.companyId
  ) {
    throw fail(
      "Équipe introuvable",
      404
    );
  }

  const existing =
    await db
      .collection("projectTeams")
      .where(
        "projectId",
        "==",
        projectId
      )
      .get();

  /*
   * Empêche de rattacher deux fois
   * la même équipe au même projet.
   */
  if (
    existing.docs.some(
      (doc) =>
        doc.data().teamId ===
        teamId
    )
  ) {
    throw fail(
      "Cette équipe est déjà rattachée au projet"
    );
  }

  const sum =
    existing.docs.reduce(
      (total, doc) =>
        total +
        num(
          doc.data().weight
        ),
      0
    );

  /*
   * Si le frontend ne fournit pas de poids, on attribue automatiquement
   * tout le poids restant. Cela permet notamment de réparer un ancien
   * projet créé sans relation projectTeams : la première équipe reçoit 100 %.
   */
  const requestedWeight =
    payload.weight === undefined ||
    payload.weight === null ||
    payload.weight === ""
      ? 100 - sum
      : num(payload.weight);

  const weight = Number(
    requestedWeight.toFixed(2)
  );

  if (weight <= 0) {
    throw fail(
      "Aucun poids disponible pour ajouter cette équipe. Le total des équipes est déjà de 100 %."
    );
  }

  if (sum + weight > 100.01) {
    throw fail(
      `Le poids des équipes dépasserait 100 % (${Number((sum + weight).toFixed(2))} %)`
    );
  }

  const timestamp =
    now();

  const sourceTeam = teamSnap.data();
  const effectiveManagerId =
    sourceTeam.leaderId ||
    sourceTeam.managerId ||
    null;

  /*
   * Un MANAGER ne peut rattacher que l'équipe dont il est responsable.
   * ADMIN et SUPER_ADMIN (= gestionnaires/administrateurs) peuvent choisir
   * les équipes de l'entreprise.
   */
  if (
    user.role === "MANAGER" &&
    String(effectiveManagerId || "") !== String(user.uid)
  ) {
    throw fail(
      "Vous ne pouvez rattacher que votre équipe à ce projet",
      403
    );
  }

  const data = {
    projectId,

    companyId:
      user.companyId,

    teamId,

    name:
      sourceTeam.name,

    weight,

    // Le responsable de l'équipe est obligatoirement son manager/leader.
    managerId:
      effectiveManagerId,

    memberIds: [
      ...new Set([
        ...(Array.isArray(sourceTeam.memberIds)
          ? sourceTeam.memberIds
          : []),
        ...(effectiveManagerId
          ? [effectiveManagerId]
          : []),
      ]),
    ],

    status:
      "ACTIVE",

    createdBy:
      user.uid,

    createdAt:
      timestamp,

    updatedAt:
      timestamp,
  };

  const ref =
    await db
      .collection("projectTeams")
      .add(data);

  await recalcProjectWeight(
    projectId
  );

  await audit(
    user,
    "PROJECT_TEAM_ADDED",
    "projectTeam",
    ref.id,
    {
      projectId,
      teamId,
      weight,
    }
  );

  return {
    id:
      ref.id,

    ...data,

    project,
  };
}

export async function addProjectSectionService(
  user,
  projectId,
  payload
) {
  if (!managerRoles.has(user.role)) {
    throw fail("Droits insuffisants", 403);
  }

  await assertProject(user, projectId);

  const projectTeamId = clean(payload.projectTeamId);
  const name = clean(payload.name);
  const weight = num(payload.weight);
  const assigneeId = clean(payload.assigneeId);

  if (!projectTeamId || !name) {
    throw fail("Équipe du projet et nom de section requis");
  }

  if (weight <= 0) {
    throw fail("Poids invalide");
  }

  const pt = await db.collection("projectTeams").doc(projectTeamId).get();

  if (
    !pt.exists ||
    pt.data().projectId !== projectId ||
    pt.data().companyId !== user.companyId
  ) {
    throw fail("Équipe du projet introuvable", 404);
  }

  const relation = pt.data();

  const relationTeamSnap = await db.collection("teams").doc(String(relation.teamId)).get();
  const relationTeam = relationTeamSnap.exists ? relationTeamSnap.data() : {};
  const effectiveManagerId =
    relationTeam.leaderId ||
    relationTeam.managerId ||
    relation.managerId ||
    null;

  if (
    user.role === "MANAGER" &&
    String(effectiveManagerId || "") !== String(user.uid)
  ) {
    throw fail("Vous ne pouvez structurer que votre équipe", 403);
  }

  if (!assigneeId) {
    throw fail("Chaque section doit avoir un responsable");
  }

  const teamSnap = relationTeamSnap;
  const team = relationTeam;
  const allowedMembers = new Set([
    ...(Array.isArray(team.memberIds) ? team.memberIds : []),
    ...(team.leaderId ? [team.leaderId] : []),
    ...(Array.isArray(relation.memberIds) ? relation.memberIds : []),
    ...(relation.managerId ? [relation.managerId] : []),
  ].map(String));

  if (!allowedMembers.has(String(assigneeId))) {
    throw fail("Le responsable choisi ne fait pas partie de cette équipe", 400);
  }

  const existing = await db.collection("projectSections")
    .where("projectTeamId", "==", projectTeamId)
    .get();

  const sum = existing.docs.reduce(
    (total, doc) => total + num(doc.data().weight),
    0
  );

  if (sum + weight > 100.01) {
    throw fail(
      `Le poids des sections dépasserait 100 % (${Number((sum + weight).toFixed(2))} %)`
    );
  }

  const timestamp = now();
  const data = {
    projectId,
    projectTeamId,
    companyId: user.companyId,
    name,
    description: clean(payload.description),
    weight,
    assigneeId,
    status: "ACTIVE",
    createdBy: user.uid,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const ref = await db.collection("projectSections").add(data);

  await audit(user, "PROJECT_SECTION_ADDED", "projectSection", ref.id, {
    projectId,
    projectTeamId,
    weight,
    assigneeId,
  });

  return { id: ref.id, ...data };
}

export async function saveProjectStructureService(user, projectId, payload) {
  if (!managerRoles.has(user.role)) {
    throw fail("Droits insuffisants", 403);
  }

  await assertProject(user, projectId);

  const sections = Array.isArray(payload?.sections)
    ? payload.sections
    : [];

  if (!sections.length) {
    throw fail("Ajoutez au moins une section");
  }

  const projectTeamsSnap = await db.collection("projectTeams")
    .where("projectId", "==", projectId)
    .where("companyId", "==", user.companyId)
    .get();

  const projectTeams = new Map(
    projectTeamsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
  );

  if (!projectTeams.size) {
    throw fail("Aucune équipe n'est rattachée à ce projet");
  }

  const projectTeamEntries = await Promise.all(
    [...projectTeams.values()].map(async (relation) => {
      const teamSnap = await db.collection("teams").doc(String(relation.teamId)).get();
      const sourceTeam = teamSnap.exists ? teamSnap.data() : {};
      return {
        relation,
        sourceTeam,
        effectiveManagerId:
          sourceTeam.leaderId ||
          sourceTeam.managerId ||
          relation.managerId ||
          null,
      };
    })
  );

  const allowedTeamIds = new Set(
    projectTeamEntries
      .filter(({ effectiveManagerId }) =>
        user.role !== "MANAGER" ||
        String(effectiveManagerId || "") === String(user.uid)
      )
      .map(({ relation }) => String(relation.id))
  );

  const byTeam = new Map();

  for (const raw of sections) {
    const projectTeamId = clean(raw.projectTeamId);
    const name = clean(raw.name);
    const weight = num(raw.weight);
    const assigneeId = clean(raw.assigneeId);

    if (!allowedTeamIds.has(projectTeamId)) {
      throw fail("Vous ne pouvez pas modifier cette équipe", 403);
    }

    if (!name || weight <= 0 || !assigneeId) {
      throw fail("Chaque section doit avoir un nom, un poids supérieur à 0 % et un responsable");
    }

    if (!byTeam.has(projectTeamId)) byTeam.set(projectTeamId, []);
    byTeam.get(projectTeamId).push({
      ...raw,
      id: raw.id || null,
      projectTeamId,
      name,
      weight,
      assigneeId,
      description: clean(raw.description),
    });
  }

  for (const [teamId, team] of projectTeams) {
    if (!allowedTeamIds.has(teamId)) continue;

    const rows = byTeam.get(teamId) || [];
    if (!rows.length) {
      throw fail(`L'équipe « ${team.name} » doit avoir au moins une section`);
    }

    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw fail(
        `Les sections de « ${team.name} » doivent totaliser 100 %. Total actuel : ${Number(total.toFixed(2))} %.`
      );
    }

    const teamEntry = projectTeamEntries.find(({ relation }) => relation.id === teamId);
    const sourceTeam = teamEntry?.sourceTeam || {};
    const allowedMembers = new Set([
      ...(Array.isArray(sourceTeam.memberIds) ? sourceTeam.memberIds : []),
      ...(sourceTeam.leaderId ? [sourceTeam.leaderId] : []),
      ...(Array.isArray(team.memberIds) ? team.memberIds : []),
      ...(team.managerId ? [team.managerId] : []),
    ].map(String));

    for (const row of rows) {
      if (!allowedMembers.has(String(row.assigneeId))) {
        throw fail(`Le responsable de « ${row.name} » ne fait pas partie de l'équipe « ${team.name} »`);
      }
    }
  }

  const existingSnap = await db.collection("projectSections")
    .where("projectId", "==", projectId)
    .get();

  const existing = new Map(
    existingSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
  );

  const batch = db.batch();
  const keptIds = new Set();
  const timestamp = now();

  for (const rows of byTeam.values()) {
    for (const row of rows) {
      const ref = row.id
        ? db.collection("projectSections").doc(String(row.id))
        : db.collection("projectSections").doc();

      if (row.id && !existing.has(String(row.id))) {
        throw fail("Une section sélectionnée n'appartient pas à ce projet", 400);
      }

      keptIds.add(ref.id);
      batch.set(ref, {
        projectId,
        projectTeamId: row.projectTeamId,
        companyId: user.companyId,
        name: row.name,
        description: row.description,
        weight: row.weight,
        assigneeId: row.assigneeId,
        status: existing.get(ref.id)?.status || "ACTIVE",
        createdBy: existing.get(ref.id)?.createdBy || user.uid,
        createdAt: existing.get(ref.id)?.createdAt || timestamp,
        updatedAt: timestamp,
      }, { merge: true });
    }
  }

  for (const [sectionId, section] of existing) {
    if (!allowedTeamIds.has(String(section.projectTeamId))) continue;

    if (!keptIds.has(sectionId)) {
      const sectionTasks = await db.collection("tasks")
        .where("sectionId", "==", sectionId)
        .limit(1)
        .get();

      if (!sectionTasks.empty) {
        throw fail(`La section « ${section.name} » contient des tâches et ne peut pas être supprimée`);
      }

      batch.delete(db.collection("projectSections").doc(sectionId));
    }
  }

  await batch.commit();

  await audit(user, "PROJECT_STRUCTURE_SAVED", "project", projectId, {
    sectionCount: sections.length,
  });

  return getProjectService(user, projectId);
}

export async function updateProjectStatusService(
  user,
  projectId,
  status
) {
  if (!managerRoles.has(user.role)) {
    throw fail(
      "Droits insuffisants",
      403
    );
  }

  const allowed = [
    "DRAFT",
    "PLANNED",
    "ACTIVE",
    "PAUSED",
    "COMPLETED",
    "ARCHIVED",
    "CANCELLED",
  ];

  if (!allowed.includes(status)) {
    throw fail(
      "Statut de projet invalide"
    );
  }

  const project =
    await assertProject(
      user,
      projectId
    );

  const updated = {
    status,

    updatedAt:
      now(),

    ...(status === "COMPLETED"
      ? {
          actualEndDate:
            now(),
        }
      : {}),
  };

  await db
    .collection("projects")
    .doc(projectId)
    .update(updated);

  await audit(
    user,
    "PROJECT_STATUS_CHANGED",
    "project",
    projectId,
    {
      from:
        project.status,

      to:
        status,
    }
  );

  return {
    ...project,
    ...updated,
  };
}

export async function updateProjectScopeService(
  user,
  projectId,
  payload
) {
  if (!managerRoles.has(user.role)) {
    throw fail(
      "Droits insuffisants",
      403
    );
  }

  const project =
    await assertProject(
      user,
      projectId
    );

  const nextVersion =
    num(project.version, 1) +
    1;

  const timestamp =
    now();

  const patch = {
    ...(Object.prototype.hasOwnProperty.call(
      payload,
      "name"
    )
      ? {
          name:
            clean(payload.name),
        }
      : {}),

    ...(Object.prototype.hasOwnProperty.call(
      payload,
      "description"
    )
      ? {
          description:
            clean(
              payload.description
            ),
        }
      : {}),

    ...(Object.prototype.hasOwnProperty.call(
      payload,
      "objective"
    )
      ? {
          objective:
            clean(
              payload.objective
            ),
        }
      : {}),

    ...(Object.prototype.hasOwnProperty.call(
      payload,
      "plannedEndDate"
    )
      ? {
          plannedEndDate:
            payload.plannedEndDate ||
            null,
        }
      : {}),

    version:
      nextVersion,

    updatedAt:
      timestamp,
  };

  const snapshot = {
    ...project,
    ...patch,
  };

  const ref =
    await db
      .collection(
        "projectVersions"
      )
      .add({
        projectId,

        companyId:
          user.companyId,

        version:
          nextVersion,

        reason:
          clean(
            payload.reason ||
              "Modification du périmètre"
          ),

        snapshot,

        createdBy:
          user.uid,

        createdAt:
          timestamp,
      });

  await db
    .collection("projects")
    .doc(projectId)
    .update({
      ...patch,
      currentVersionId:
        ref.id,
    });

  await audit(
    user,
    "PROJECT_SCOPE_CHANGED",
    "project",
    projectId,
    {
      version:
        nextVersion,

      reason:
        payload.reason ||
        null,
    }
  );

  return {
    ...snapshot,

    currentVersionId:
      ref.id,
  };
}

async function recalcProjectWeight(
  projectId
) {
  const snap =
    await db
      .collection("projectTeams")
      .where(
        "projectId",
        "==",
        projectId
      )
      .get();

  const totalWeight =
    snap.docs.reduce(
      (sum, doc) =>
        sum +
        num(
          doc.data().weight
        ),
      0
    );

  await db
    .collection("projects")
    .doc(projectId)
    .update({
      totalWeight,

      updatedAt:
        now(),
    });
}

export async function listProjectVersionsService(
  user,
  projectId
) {
  await assertProject(
    user,
    projectId
  );

  const snap =
    await db
      .collection(
        "projectVersions"
      )
      .where(
        "projectId",
        "==",
        projectId
      )
      .get();

  return snap.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .sort(
      (a, b) =>
        b.version -
        a.version
    );
}