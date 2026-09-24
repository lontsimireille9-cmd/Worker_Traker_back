import { db } from "../config/firebase.js";

const projectsRef = db.collection("projects");
const projectTeamsRef = db.collection("projectTeams");
const teamsRef = db.collection("teams");
const usersRef = db.collection("users");

/**
 * Retourne les membres d'une équipe avec leurs informations utilisateur.
 *
 * Le frontend de ProjectDetails.jsx utilise team.members
 * pour afficher les personnes pouvant être responsables
 * d'une section.
 */
async function getTeamMembers(team) {
  if (!team) {
    return [];
  }

  const memberIds = [
    ...(Array.isArray(team.memberIds) ? team.memberIds : []),
    ...(team.leaderId ? [team.leaderId] : []),
  ];

  const uniqueIds = [
    ...new Set(
      memberIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ),
  ];

  if (!uniqueIds.length) {
    return [];
  }

  const members = await Promise.all(
    uniqueIds.map(async (memberId) => {
      const userSnap = await usersRef.doc(memberId).get();

      if (!userSnap.exists) {
        return null;
      }

      const user = userSnap.data();

      return {
        uid: memberId,
        id: memberId,
        userId: memberId,

        name:
          user.name ||
          [user.prenom, user.nom]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          user.displayName ||
          user.email ||
          user.matricule ||
          memberId,

        displayName:
          user.displayName ||
          user.name ||
          [user.prenom, user.nom]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          user.email ||
          user.matricule ||
          memberId,

        fullName:
          [user.prenom, user.nom]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          user.name ||
          user.displayName ||
          user.email ||
          user.matricule ||
          memberId,

        email: user.email || "",
        matricule: user.matricule || "",
        role: user.role || "",
      };
    })
  );

  return members.filter(Boolean);
}

/**
 * Affecte une équipe à un projet.
 */
export async function assignTeamToProject({
  user,
  companyId,
  projectId,
  teamId,
  managerId = null,
  weight,
}) {
  if (!companyId || !projectId || !teamId) {
    throw new Error(
      "companyId, projectId et teamId sont obligatoires"
    );
  }

  if (
    typeof weight !== "number" ||
    weight <= 0 ||
    weight > 100
  ) {
    throw new Error(
      "Le poids de l'équipe doit être compris entre 0 et 100"
    );
  }

  const projectSnap = await projectsRef
    .doc(projectId)
    .get();

  if (!projectSnap.exists) {
    throw new Error("Projet introuvable");
  }

  const project = projectSnap.data();

  if (project.companyId !== companyId) {
    throw new Error(
      "Le projet n'appartient pas à cette entreprise"
    );
  }

  const teamSnap = await teamsRef
    .doc(teamId)
    .get();

  if (
    !teamSnap.exists ||
    teamSnap.data().companyId !== companyId
  ) {
    throw new Error(
      "Équipe introuvable ou hors de l'entreprise"
    );
  }

  const team = teamSnap.data();

  /**
   * Le responsable de l'équipe est le leaderId.
   */
  const teamManagerId = team.leaderId || null;

  if (!teamManagerId) {
    throw new Error(
      "Cette équipe n'a pas de responsable MANAGER"
    );
  }

  if (
    user?.role === "MANAGER" &&
    String(teamManagerId) !== String(user.uid)
  ) {
    throw Object.assign(
      new Error(
        "Un manager ne peut rattacher que son équipe au projet"
      ),
      { status: 403 }
    );
  }

  const existing = await projectTeamsRef
    .where("projectId", "==", projectId)
    .where("teamId", "==", teamId)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error(
      "Cette équipe est déjà affectée au projet"
    );
  }

  /**
   * Tous les membres de l'équipe.
   *
   * Le manager est toujours ajouté afin qu'il soit
   * disponible comme responsable de section.
   */
  const memberIds = [
    ...new Set([
      ...(Array.isArray(team.memberIds)
        ? team.memberIds
        : []),
      teamManagerId,
    ]),
  ];

  const ref = projectTeamsRef.doc();

  await ref.set({
    id: ref.id,
    companyId,
    projectId,
    teamId,

    // Responsable de l'équipe.
    managerId: teamManagerId,

    // Tous les membres autorisés pour les sections.
    memberIds,

    weight,

    status: "ACTIVE",

    createdAt: new Date(),
    updatedAt: new Date(),
  });

  /**
   * On récupère immédiatement les membres complets
   * pour que la réponse soit cohérente avec getProjectTeams().
   */
  const members = await getTeamMembers({
    ...team,
    memberIds,
    leaderId: teamManagerId,
  });

  return {
    id: ref.id,
    companyId,
    projectId,

    teamId,

    teamName: team.name || "",

    managerId: teamManagerId,

    memberIds,

    members,

    weight,

    status: "ACTIVE",
  };
}

/**
 * Retourne toutes les équipes affectées au projet.
 *
 * IMPORTANT :
 * Cette fonction enrichit chaque équipe avec :
 *
 * - teamName
 * - members
 * - manager
 *
 * C'est ce qui permet à ProjectDetails.jsx
 * d'afficher les membres dans :
 * "Responsable de section".
 */
export async function getProjectTeams(
  companyId,
  projectId
) {
  const snapshot = await projectTeamsRef
    .where("companyId", "==", companyId)
    .where("projectId", "==", projectId)
    .get();

  const projectTeams = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const projectTeam = {
        id: doc.id,
        ...doc.data(),
      };

      /**
       * Récupération de l'équipe originale.
       */
      let team = null;

      if (projectTeam.teamId) {
        const teamSnap = await teamsRef
          .doc(projectTeam.teamId)
          .get();

        if (teamSnap.exists) {
          team = {
            id: teamSnap.id,
            ...teamSnap.data(),
          };
        }
      }

      /**
       * On conserve les IDs déjà enregistrés dans
       * projectTeams et on complète avec ceux de l'équipe.
       */
      const memberIds = [
        ...new Set([
          ...(Array.isArray(projectTeam.memberIds)
            ? projectTeam.memberIds
            : []),

          ...(Array.isArray(team?.memberIds)
            ? team.memberIds
            : []),

          ...(team?.leaderId
            ? [team.leaderId]
            : []),

          ...(projectTeam.managerId
            ? [projectTeam.managerId]
            : []),
        ]),
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean);

      /**
       * Récupération des utilisateurs.
       */
      const members = await getTeamMembers({
        ...(team || {}),
        memberIds,
        leaderId:
          team?.leaderId ||
          projectTeam.managerId ||
          null,
      });

      const managerId =
        projectTeam.managerId ||
        team?.leaderId ||
        null;

      const manager =
        members.find(
          (member) =>
            String(member.uid) ===
            String(managerId)
        ) || null;

      return {
        ...projectTeam,

        /**
         * Informations de l'équipe.
         */
        teamName:
          team?.name ||
          projectTeam.teamName ||
          "",

        name:
          team?.name ||
          projectTeam.teamName ||
          projectTeam.name ||
          "Équipe",

        department:
          team?.department ||
          projectTeam.department ||
          "",

        /**
         * Responsable de l'équipe.
         */
        managerId,

        manager,

        /**
         * Membres disponibles pour les sections.
         */
        memberIds,

        members,

        /**
         * Compatibilité avec l'ancien frontend.
         */
        leaderId:
          team?.leaderId ||
          projectTeam.leaderId ||
          managerId,

        leader: manager,
      };
    })
  );

  return projectTeams;
}

/**
 * Vérifie que les poids des équipes du projet
 * totalisent 100 %.
 */
export async function validateProjectTeamWeights(
  companyId,
  projectId
) {
  const teams = await getProjectTeams(
    companyId,
    projectId
  );

  const total = teams.reduce(
    (sum, team) =>
      sum + Number(team.weight || 0),
    0
  );

  return {
    valid: Math.abs(total - 100) < 0.001,
    total,
    teams,
  };
}