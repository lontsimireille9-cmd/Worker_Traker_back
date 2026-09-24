import { db } from "../config/firebase.js";

const tasksRef = db.collection("tasks");
const sectionsRef = db.collection("projectSections");

export async function createSectionTask({
  companyId,
  projectId,
  sectionId,
  title,
  description = "",
  assigneeId,
  assignedBy,
  estimatedPoints = 0,
  deadline = null,
  priority = "MEDIUM"
}) {
  if (
    !companyId ||
    !projectId ||
    !sectionId ||
    !title ||
    !assigneeId ||
    !assignedBy
  ) {
    throw new Error(
      "companyId, projectId, sectionId, title, assigneeId et assignedBy sont obligatoires"
    );
  }

  const sectionSnap = await sectionsRef.doc(sectionId).get();

  if (!sectionSnap.exists) {
    throw new Error("Section introuvable");
  }

  const section = sectionSnap.data();

  if (
    section.companyId !== companyId ||
    section.projectId !== projectId
  ) {
    throw new Error("Cette section n'appartient pas à ce projet");
  }

  const ref = tasksRef.doc();

  await ref.set({
    id: ref.id,
    companyId,
    projectId,
    sectionId,

    teamId: section.teamId,
    projectTeamId: section.projectTeamId,

    title,
    description,

    assigneeId,
    assignedBy,

    estimatedPoints: Number(estimatedPoints || 0),

    priority,
    deadline,

    status: "TODO",

    submittedAt: null,
    validatedAt: null,

    createdAt: new Date(),
    updatedAt: new Date()
  });

  const [projectSnap, teamSnap, assigneeSnap] = await Promise.all([
    db.collection("projects").doc(String(projectId)).get(),
    db.collection("teams").doc(String(section.teamId || "")).get(),
    db.collection("users").doc(String(assigneeId)).get(),
  ]);

  const projectData = projectSnap.exists ? projectSnap.data() : {};
  const teamData = teamSnap.exists ? teamSnap.data() : {};
  const assigneeData = assigneeSnap.exists ? assigneeSnap.data() : {};

  return {
    id: ref.id,
    companyId,
    projectId,
    projectName: projectData.name || projectData.title || "Projet",
    sectionId,
    sectionName: section.name || "Section",
    teamId: section.teamId,
    teamName: teamData.name || "Équipe",
    projectTeamId: section.projectTeamId,
    title,
    description,
    assigneeId,
    assigneeName: assigneeData.name || assigneeData.displayName || assigneeData.fullName || assigneeData.email || "Employé",
    assignedBy,
    estimatedPoints: Number(estimatedPoints || 0),
    priority,
    deadline,
    status: "TODO"
  };
}

export async function getSectionTasks(user, companyId, projectId, sectionId) {
  const sectionSnap = await sectionsRef.doc(String(sectionId)).get();
  if (!sectionSnap.exists) throw new Error("Section introuvable");

  const section = sectionSnap.data();
  if (
    section.companyId !== companyId ||
    String(section.projectId) !== String(projectId)
  ) {
    throw new Error("Cette section n'appartient pas à ce projet");
  }

  const isManager = ["SUPER_ADMIN", "ADMIN"].includes(user?.role);
  let allowed = isManager;

  const relationSnap = await db.collection("projectTeams").doc(String(section.projectTeamId)).get();
  const relation = relationSnap.exists ? relationSnap.data() : null;

  if (!allowed && relation) {
    if (user?.role === "MANAGER") {
      allowed = String(relation.managerId || "") === String(user.uid);
    }

    if (user?.role === "EMPLOYEE") {
      allowed = String(section.assigneeId || "") === String(user.uid);
    }
  }

  if (!allowed) {
    throw new Error("Vous n'avez pas accès à cette section");
  }

  const snapshot = await tasksRef
    .where("companyId", "==", companyId)
    .where("projectId", "==", projectId)
    .where("sectionId", "==", sectionId)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}
