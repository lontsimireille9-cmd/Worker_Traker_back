import {
  addGroupMemberService,
  createGroupService,
  createPrivateConversationService,
  deleteGroupService,
  getConversationService,
  leaveGroupService,
  listConversationsService,
  listMessagesService,
  markConversationReadService,
  removeGroupMemberService,
  renameGroupService,
  searchMessagingUsersService,
  sendMessageService,
  registerMessagingTokenService,
} from '../services/messaging.service.js';
import { sendSuccess } from '../utils/response.js';

export async function listConversations(req, res, next) {
  try { return sendSuccess(res, 200, 'Conversations récupérées', await listConversationsService(req.user)); } catch (error) { next(error); }
}
export async function searchUsers(req, res, next) {
  try { return sendSuccess(res, 200, 'Employés récupérés', await searchMessagingUsersService(req.user, req.query.q)); } catch (error) { next(error); }
}
export async function registerMessagingToken(req, res, next) {
  try { return sendSuccess(res, 200, 'Token de notification enregistré', await registerMessagingTokenService(req.user, req.body?.token)); } catch (error) { next(error); }
}
export async function getConversation(req, res, next) {
  try { return sendSuccess(res, 200, 'Conversation récupérée', await getConversationService(req.user, req.params.id)); } catch (error) { next(error); }
}
export async function createPrivateConversation(req, res, next) {
  try { return sendSuccess(res, 200, 'Conversation privée prête', await createPrivateConversationService(req.user, req.body?.userId)); } catch (error) { next(error); }
}
export async function createGroup(req, res, next) {
  try { return sendSuccess(res, 201, 'Groupe créé', await createGroupService(req.user, req.body)); } catch (error) { next(error); }
}
export async function listMessages(req, res, next) {
  try { return sendSuccess(res, 200, 'Messages récupérés', await listMessagesService(req.user, req.params.id, req.query.limit, req.query.before)); } catch (error) { next(error); }
}
export async function sendMessage(req, res, next) {
  try { return sendSuccess(res, 201, 'Message envoyé', await sendMessageService(req.user, req.params.id, req.body)); } catch (error) { next(error); }
}
export async function markRead(req, res, next) {
  try { return sendSuccess(res, 200, 'Conversation marquée comme lue', await markConversationReadService(req.user, req.params.id)); } catch (error) { next(error); }
}
export async function addMember(req, res, next) {
  try { return sendSuccess(res, 201, 'Membre ajouté', await addGroupMemberService(req.user, req.params.id, req.body?.userId)); } catch (error) { next(error); }
}
export async function removeMember(req, res, next) {
  try { await removeGroupMemberService(req.user, req.params.id, req.params.userId); return sendSuccess(res, 200, 'Membre retiré', null); } catch (error) { next(error); }
}
export async function leaveGroup(req, res, next) {
  try { await leaveGroupService(req.user, req.params.id); return sendSuccess(res, 200, 'Groupe quitté', null); } catch (error) { next(error); }
}
export async function renameGroup(req, res, next) {
  try { return sendSuccess(res, 200, 'Groupe modifié', await renameGroupService(req.user, req.params.id, req.body?.name)); } catch (error) { next(error); }
}
export async function deleteGroup(req, res, next) {
  try { await deleteGroupService(req.user, req.params.id); return sendSuccess(res, 200, 'Groupe supprimé', null); } catch (error) { next(error); }
}
