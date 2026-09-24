import { db } from "../config/firebase.js";

const sectionsRef = db.collection("projectSections");
const projectTeamsRef = db.collection("projectTeams");

async function assertSectionAccess(user, projectId, projectTeamId = null) {
  if (!user?.companyId) throw Object.assign(new Error("Entreprise requise"), { status: 400 });

  const projectSnap = await db.collection("projects").doc(String(projectId)).get();
  if (!projectSnap.exists || projectSnap.data().companyId !== user.companyId) {
    throw Object.assign(new Error("Projet introuvable ou accès refusé"), { status: 404 });
  }

  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return projectSnap;

  let relationSnap = projectTeamId
    ? await projectTeamsRef.doc(String(projectTeamId)).get()
    : null;

  if (!relationSnap && user.role === "MANAGER") {
    const managed = await projectTeamsRef
      .where("projectId", "==", String(projectId))
      .where("companyId", "==", user.companyId)
      .get();

    if (managed.docs.some((doc) => String(doc.data().managerId || "") === String(user.uid))) {
      return projectSnap;
    }
  }

  if (relationSnap?.exists) {
    const relation = relationSnap.data();
    if (
      relation.companyId === user.companyId &&
      String(relation.projectId) === String(projectId)
    ) {
      if (user.role === "MANAGER" && String(relation.managerId || "") === String(user.uid)) return projectSnap;
      if (user.role === "EMPLOYEE") {
        const teamSnap = await db.collection("teams").doc(String(relation.teamId)).get();
        const memberIds = teamSnap.exists && Array.isArray(teamSnap.data().memberIds)
          ? teamSnap.data().memberIds.map(String)
          : [];
        if (memberIds.includes(String(user.uid)) || String(teamSnap.data()?.leaderId || "") === String(user.uid)) {
          return projectSnap;
        }
      }
    }
  }

  throw Object.assign(new Error("Accès refusé"), { status: 403 });
}

export async function createProjectSection({
  user,
  companyId,
  projectId,
  projectTeamId,
  name,
  description = "",
  weight,
  assigneeId = null
}) {
  await assertSectionAccess(user, projectId, projectTeamId);
  if (!companyId || !projectId || !projectTeamId || !name) {
    throw new Error(
      "companyId, projectId, projectTeamId et name sont obligatoires"
    );
  }

  if (typeof weight !== "number" || weight <= 0 || weight > 100) {
    throw new Error("Le poids de la section doit être compris entre 0 et 100");
  }

  const teamParticipation = await projectTeamsRef
    .doc(projectTeamId)
    .get();

  if (!teamParticipation.exists) {
    throw new Error("Participation de l'équipe au projet introuvable");
  }

  const participation = teamParticipation.data();

  if (
    participation.companyId !== companyId ||
    participation.projectId !== projectId
  ) {
    throw new Error("Cette équipe n'est pas rattachée à ce projet");
  }

  if (assigneeId) {
    const teamSnap = await db.collection("teams").doc(String(participation.teamId)).get();
    const team = teamSnap.exists ? teamSnap.data() : {};
    const members = Array.isArray(team.memberIds) ? team.memberIds.map(String) : [];
    if (!members.includes(String(assigneeId)) && String(team.leaderId || '') !== String(assigneeId)) throw new Error("Le membre attribué n'appartient pas à l'équipe");
  }

  const ref = sectionsRef.doc();

  await ref.set({
    id: ref.id,
    companyId,
    projectId,
    projectTeamId,
    teamId: participation.teamId,
    name,
    description,
    weight,
    assigneeId: assigneeId || null,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return {
    id: ref.id,
    companyId,
    projectId,
    projectTeamId,
    teamId: participation.teamId,
    name,
    description,
    weight,
    assigneeId: assigneeId || null,
    status: "ACTIVE"
  };
}

export async function getProjectSections(user, companyId, projectId) {
  await assertSectionAccess(user, projectId);
  const snapshot = await sectionsRef
    .where("companyId", "==", companyId)
    .where("projectId", "==", projectId)
    .get();

  const sections = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (user.role === "EMPLOYEE") {
    return sections.filter((section) => String(section.assigneeId || "") === String(user.uid));
  }

  return sections;
}

export async function getTeamProjectSections(
  user,
  companyId,
  projectId,
  projectTeamId
) {
  await assertSectionAccess(user, projectId, projectTeamId);
  const snapshot = await sectionsRef
    .where("companyId", "==", companyId)
    .where("projectId", "==", projectId)
    .where("projectTeamId", "==", projectTeamId)
    .get();

  const sections = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (user.role === "EMPLOYEE") {
    return sections.filter((section) => String(section.assigneeId || "") === String(user.uid));
  }

  return sections;
}

export async function validateSectionWeights(
  user,
  companyId,
  projectId,
  projectTeamId
) {
  const sections = await getTeamProjectSections(
    user,
    companyId,
    projectId,
    projectTeamId
  );

  const total = sections.reduce(
    (sum, section) => sum + Number(section.weight || 0),
    0
  );

  return {
    valid: Math.abs(total - 100) < 0.001,
    total,
    sections
  };
}
