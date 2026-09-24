import {
  createProjectService,
  listProjectsService,
  getProjectService,
  addProjectTeamService,
  addProjectSectionService,
  saveProjectStructureService,
  updateProjectStatusService,
  updateProjectScopeService,
  listProjectVersionsService,
} from "../services/project.service.js";

import {
  sendSuccess,
} from "../utils/response.js";

/**
 * Création d'un projet.
 *
 * Le projet peut être créé sans équipe.
 * La structure peut ensuite être créée
 * directement par le MANAGER / ADMIN / SUPER_ADMIN.
 */
export async function createProject(
  req,
  res,
  next
) {
  try {
    const result =
      await createProjectService(
        req.user,
        req.body
      );

    return sendSuccess(
      res,
      201,
      "Projet créé",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Liste des projets.
 */
export async function listProjects(
  req,
  res,
  next
) {
  try {
    const result =
      await listProjectsService(
        req.user
      );

    return sendSuccess(
      res,
      200,
      "Projets récupérés",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Détail d'un projet.
 */
export async function getProject(
  req,
  res,
  next
) {
  try {
    const result =
      await getProjectService(
        req.user,
        req.params.id
      );

    return sendSuccess(
      res,
      200,
      "Projet récupéré",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Ajout d'une équipe au projet.
 *
 * Cette action est maintenant facultative.
 * Elle sert lorsque l'administrateur veut
 * rattacher une équipe au projet.
 */
export async function addProjectTeam(
  req,
  res,
  next
) {
  try {
    const result =
      await addProjectTeamService(
        req.user,
        req.params.id,
        req.body
      );

    return sendSuccess(
      res,
      201,
      "Équipe ajoutée",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Création d'une section.
 *
 * projectTeamId peut être absent :
 * la section sera alors créée directement
 * dans la structure globale du projet.
 */
export async function addProjectSection(
  req,
  res,
  next
) {
  try {
    const result =
      await addProjectSectionService(
        req.user,
        req.params.id,
        req.body
      );

    return sendSuccess(
      res,
      201,
      "Section créée",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Enregistrement complet de la structure.
 *
 * C'est cette action qui permet au MANAGER
 * de construire directement la structure
 * du projet sans devoir ajouter une équipe.
 */
export async function saveProjectStructure(
  req,
  res,
  next
) {
  try {
    const result =
      await saveProjectStructureService(
        req.user,
        req.params.id,
        req.body
      );

    return sendSuccess(
      res,
      200,
      "Structure du projet enregistrée",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Mise à jour du statut du projet.
 */
export async function updateProjectStatus(
  req,
  res,
  next
) {
  try {
    const result =
      await updateProjectStatusService(
        req.user,
        req.params.id,
        req.body.status
      );

    return sendSuccess(
      res,
      200,
      "Statut du projet mis à jour",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Modification du périmètre.
 */
export async function updateProjectScope(
  req,
  res,
  next
) {
  try {
    const result =
      await updateProjectScopeService(
        req.user,
        req.params.id,
        req.body
      );

    return sendSuccess(
      res,
      200,
      "Projet versionné",
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Liste des versions du projet.
 */
export async function listProjectVersions(
  req,
  res,
  next
) {
  try {
    const result =
      await listProjectVersionsService(
        req.user,
        req.params.id
      );

    return sendSuccess(
      res,
      200,
      "Versions récupérées",
      result
    );
  } catch (error) {
    next(error);
  }
}