import { createHash } from 'node:crypto';
import { admin, db } from '../config/firebase.js';
import { addUserMessagingToken, findUsersByCompany, findUserById } from '../repositories/user.repository.js';
import {
  addConversationMember,
  createConversationTransaction,
  createMessageWithUnread,
  deleteConversation,
  findConversationById,
  findMember,
  listConversationMembers,
  listUserConversations,
  listMessages,
  removeConversationMember,
  updateConversation,
  updateMember,
} from '../repositories/messaging.repository.js';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_GROUP_NAME_LENGTH = 80;
const MAX_PAGE_SIZE = 50;
const COMPANY_SYNC_TTL = 5 * 60 * 1000;
const companySyncTimes = new Map();

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function nowIso() {
  return new Date().toISOString();
}

function displayName(user) {
  return user?.name || [user?.prenom, user?.nom].filter(Boolean).join(' ').trim() || user?.email || 'Utilisateur';
}

function publicUser(user) {
  return {
    uid: user.uid,
    name: displayName(user),
    email: user.email || null,
    role: user.role || 'EMPLOYEE',
    department: user.department || '',
    position: user.position || '',
    photoURL: user.photoURL || null,
    status: user.status || 'ACTIVE',
  };
}

function privateConversationId(userA, userB) {
  const key = [userA, userB].sort().join(':');
  return `private_${createHash('sha256').update(key).digest('hex').slice(0, 40)}`;
}

async function assertCompanyUser(userId, companyId) {
  const user = await findUserById(userId);
  if (!user || user.companyId !== companyId || user.status === 'DISABLED') {
    fail('Utilisateur introuvable ou non membre de votre entreprise', 404);
  }
  return user;
}

async function assertConversationAccess(conversationId, user) {
  const conversation = await findConversationById(conversationId);
  if (!conversation) fail('Conversation introuvable', 404);
  if (conversation.companyId !== user.companyId) fail('Conversation inaccessible', 403);
  const member = await findMember(conversationId, user.uid);
  if (!member) fail('Vous n’êtes pas membre de cette conversation', 403);
  return { conversation, member };
}

export async function searchMessagingUsersService(user, search = '') {
  if (!user.companyId) return [];
  const normalized = String(search || '').trim().toLowerCase();
  const users = await findUsersByCompany(user.companyId);
  return users
    .filter((candidate) => candidate.uid !== user.uid && candidate.status !== 'DISABLED')
    .map(publicUser)
    .filter((candidate) => !normalized || `${candidate.name} ${candidate.email || ''} ${candidate.department} ${candidate.position}`.toLowerCase().includes(normalized))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .slice(0, 30);
}

async function ensureCompanyConversationService(user) {
  if (!user.companyId) return null;
  const users = await findUsersByCompany(user.companyId);
  const userIds = [...new Set(users.filter((item) => item.status !== 'DISABLED').map((item) => item.uid))];
  if (!userIds.includes(user.uid)) userIds.push(user.uid);
  const companyAdmin = users.find((item) => item.role === 'SUPER_ADMIN' && item.status !== 'DISABLED') || user;
  const id = `company_${createHash('sha256').update(String(user.companyId)).digest('hex').slice(0, 40)}`;
  const now = nowIso();
  const conversation = { id, type: 'group', companyId: user.companyId, name: 'Tous les employés', avatar: null, createdBy: companyAdmin.uid, createdAt: now, updatedAt: now, lastMessage: '', lastMessageAt: null, lastMessageSenderId: null, isCompanyGroup: true };
  const created = await createConversationTransaction(conversation, userIds.map((userId) => ({ conversationId: id, userId, role: userId === companyAdmin.uid ? 'admin' : 'member', joinedAt: now, lastReadAt: userId === user.uid ? now : null, unreadCount: 0 })));
  const existingMembers = await listConversationMembers(id);
  const existingIds = new Set(existingMembers.map((item) => item.userId));
  const missing = userIds.filter((userId) => !existingIds.has(userId));
  for (const userId of missing) {
    await addConversationMember({ conversationId: id, userId, role: userId === companyAdmin.uid ? 'admin' : 'member', joinedAt: now, lastReadAt: userId === user.uid ? now : null, unreadCount: 0 });
  }
  const currentAdmin = existingMembers.find((item) => item.userId === companyAdmin.uid);
  if (currentAdmin?.role !== 'admin') {
    await updateMember(id, companyAdmin.uid, { role: 'admin' });
  }
  await Promise.all(existingMembers.filter((item) => item.userId !== companyAdmin.uid && item.role === 'admin').map((item) => updateMember(id, item.userId, { role: 'member' })));
  if (created.createdBy !== companyAdmin.uid || created.name !== 'Tous les employés' || !created.isCompanyGroup) {
    await updateConversation(id, { createdBy: companyAdmin.uid, name: 'Tous les employés', isCompanyGroup: true });
  }
  return { ...created, createdBy: companyAdmin.uid, isCompanyGroup: true };
}

export async function listConversationsService(user) {
  if (!user.companyId) return [];
  const lastSync = companySyncTimes.get(user.companyId) || 0;
  if (Date.now() - lastSync > COMPANY_SYNC_TTL) {
    await ensureCompanyConversationService(user);
    companySyncTimes.set(user.companyId, Date.now());
  }
  const memberships = await listUserConversations(user.uid);
  const result = [];

  const conversationResults = await Promise.all(memberships.map(async (entry) => {
    const { membership, conversation } = entry;
    if (!conversation || conversation.companyId !== user.companyId) return null;

    let name = conversation.name || 'Conversation';
    let avatar = conversation.avatar || null;
    let otherUser = null;

    if (conversation.type === 'private') {
      const memberList = await listConversationMembers(conversation.id);
      const other = memberList.find((item) => item.userId !== user.uid);
      if (other) {
        const profile = await findUserById(other.userId);
        otherUser = profile ? publicUser(profile) : null;
        name = otherUser?.name || 'Utilisateur';
        avatar = otherUser?.photoURL || null;
      }
    }

    return {
      id: conversation.id,
      type: conversation.type,
      name,
      avatar,
      createdBy: conversation.createdBy,
      updatedAt: conversation.updatedAt || conversation.createdAt,
      lastMessage: conversation.lastMessage || '',
      lastMessageAt: conversation.lastMessageAt || null,
      lastMessageSenderId: conversation.lastMessageSenderId || null,
      unreadCount: Number(membership.unreadCount || 0),
      role: membership.role || 'member',
      otherUser,
      isCompanyGroup: Boolean(conversation.isCompanyGroup),
    };
  }));

  result.push(...conversationResults.filter(Boolean));

  return result.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export async function getConversationService(user, conversationId) {
  const { conversation, member } = await assertConversationAccess(conversationId, user);
  const members = await listConversationMembers(conversationId);
  const users = await Promise.all(members.map((item) => findUserById(item.userId)));

  return {
    id: conversation.id,
    type: conversation.type,
    name: conversation.name || null,
    avatar: conversation.avatar || null,
    createdBy: conversation.createdBy,
    isCompanyGroup: Boolean(conversation.isCompanyGroup),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    role: member.role || 'member',
    members: members.map((item, index) => ({
      ...item,
      user: users[index] ? publicUser(users[index]) : null,
    })),
  };
}

export async function createPrivateConversationService(user, targetUserId) {
  if (!user.companyId) fail('Aucune entreprise active', 400);
  if (!targetUserId || targetUserId === user.uid) fail('Sélectionnez un autre employé', 400);
  const target = await assertCompanyUser(targetUserId, user.companyId);
  const id = privateConversationId(user.uid, target.uid);
  const now = nowIso();

  const conversation = {
    id,
    type: 'private',
    companyId: user.companyId,
    name: null,
    avatar: null,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
    lastMessage: '',
    lastMessageAt: null,
    lastMessageSenderId: null,
  };

  const created = await createConversationTransaction(conversation, [
    { conversationId: id, userId: user.uid, role: 'member', joinedAt: now, lastReadAt: now, unreadCount: 0 },
    { conversationId: id, userId: target.uid, role: 'member', joinedAt: now, lastReadAt: null, unreadCount: 0 },
  ]);

  return { ...created, otherUser: publicUser(target) };
}

export async function createGroupService(user, payload) {
  if (!user.companyId) fail('Aucune entreprise active', 400);
  const name = String(payload?.name || '').trim();
  if (!name) fail('Nom du groupe requis');
  if (name.length > MAX_GROUP_NAME_LENGTH) fail(`Le nom du groupe ne peut pas dépasser ${MAX_GROUP_NAME_LENGTH} caractères`);

  const requestedIds = Array.isArray(payload?.memberIds) ? payload.memberIds.map(String).map((id) => id.trim()).filter(Boolean) : [];
  const memberIds = [...new Set([user.uid, ...requestedIds])];
  if (memberIds.length < 2) fail('Un groupe doit contenir au moins deux membres');
  if (memberIds.length > 100) fail('Un groupe ne peut pas dépasser 100 membres');

  const memberUsers = await Promise.all(memberIds.map((id) => assertCompanyUser(id, user.companyId)));
  const now = nowIso();
  const id = `group_${db.collection('conversations').doc().id}`;
  const conversation = {
    id,
    type: 'group',
    companyId: user.companyId,
    name,
    avatar: typeof payload?.avatar === 'string' ? payload.avatar.trim().slice(0, 500) || null : null,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
    lastMessage: '',
    lastMessageAt: null,
    lastMessageSenderId: null,
  };
  const created = await createConversationTransaction(conversation, memberUsers.map((member) => ({
    conversationId: id,
    userId: member.uid,
    role: member.uid === user.uid ? 'admin' : 'member',
    joinedAt: now,
    lastReadAt: member.uid === user.uid ? now : null,
    unreadCount: 0,
  })));

  return { ...created, members: memberUsers.map(publicUser) };
}

export async function listMessagesService(user, conversationId, limit = 30, before = null) {
  await assertConversationAccess(conversationId, user);
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), MAX_PAGE_SIZE);
  const parsedBefore = before ? String(before) : null;
  const result = await listMessages(conversationId, safeLimit, parsedBefore);
  const members = await listConversationMembers(conversationId);
  const recipients = members.filter((member) => member.userId !== user.uid);
  const recipientReadTimes = recipients.map((member) => new Date(member.lastReadAt || 0).getTime());
  const messages = result.map((message) => {
    if (message.senderId !== user.uid) return message;
    const messageTime = new Date(message.createdAt || 0).getTime();
    const delivered = recipients.length > 0;
    const read = delivered && recipientReadTimes.every((readAt) => readAt >= messageTime);
    return { ...message, status: read ? 'read' : delivered ? 'delivered' : 'sent' };
  });
  return {
    messages: messages.reverse(),
    hasMore: result.length === safeLimit,
    nextBefore: result.length ? result[0].createdAt : null,
  };
}

export async function sendMessageService(user, conversationId, payload) {
  const { conversation } = await assertConversationAccess(conversationId, user);
  const content = String(payload?.content || '').trim();
  if (!content) fail('Le message ne peut pas être vide');
  if (content.length > MAX_MESSAGE_LENGTH) fail(`Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères`);

  const members = await listConversationMembers(conversation.id);
  const now = nowIso();
  const sender = await findUserById(user.uid);
  const message = {
    conversationId: conversation.id,
    companyId: user.companyId,
    senderId: user.uid,
    senderName: displayName(sender || user),
    senderPhotoURL: sender?.photoURL || null,
    content,
    messageType: 'text',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const savedMessage = await createMessageWithUnread(message, members);
  await notifyMessageRecipients(savedMessage, members, user.uid);
  return { ...savedMessage, status: members.some((member) => member.userId !== user.uid) ? 'delivered' : 'sent' };
}

async function notifyMessageRecipients(message, members, senderId) {
  try {
    const recipientProfiles = await Promise.all(members.filter((member) => member.userId !== senderId).map((member) => findUserById(member.userId)));
    const tokens = recipientProfiles.flatMap((profile) => Object.keys(profile?.messagingTokens || {})).filter(Boolean);
    if (!tokens.length) return;
    await admin.messaging().sendEachForMulticast({
      tokens: [...new Set(tokens)],
      notification: { title: message.senderName || 'Nouveau message', body: message.content.slice(0, 120) },
      data: { conversationId: message.conversationId, messageId: message.id },
    });
  } catch (error) {
    console.warn('[Messaging] Notification FCM non envoyée:', error.message);
  }
}

export async function registerMessagingTokenService(user, token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken || normalizedToken.length < 20) fail('Token de notification invalide', 400);
  await addUserMessagingToken(user.uid, normalizedToken);
  return { registered: true };
}

export async function markConversationReadService(user, conversationId) {
  await assertConversationAccess(conversationId, user);
  const now = nowIso();
  return updateMember(conversationId, user.uid, { lastReadAt: now, unreadCount: 0 });
}

export async function addGroupMemberService(user, conversationId, userId) {
  const { conversation, member } = await assertConversationAccess(conversationId, user);
  if (conversation.type !== 'group') fail('Cette conversation n’est pas un groupe', 400);
  if (conversation.isCompanyGroup) fail('Les membres du groupe de l’entreprise sont gérés automatiquement', 403);
  if (member.role !== 'admin') fail('Seul l’administrateur du groupe peut ajouter un membre', 403);
  const target = await assertCompanyUser(userId, user.companyId);
  const existing = await findMember(conversationId, target.uid);
  if (existing) return existing;
  return addConversationMember({ conversationId, userId: target.uid, role: 'member', joinedAt: nowIso(), lastReadAt: null, unreadCount: 0 });
}

export async function removeGroupMemberService(user, conversationId, userId) {
  const { conversation, member } = await assertConversationAccess(conversationId, user);
  if (conversation.type !== 'group') fail('Cette conversation n’est pas un groupe', 400);
  if (conversation.isCompanyGroup) fail('Les membres du groupe de l’entreprise sont gérés automatiquement', 403);
  if (member.role !== 'admin') fail('Seul l’administrateur du groupe peut retirer un membre', 403);
  if (userId === conversation.createdBy) fail('Le créateur du groupe ne peut pas être retiré');
  if (!(await findMember(conversationId, userId))) fail('Membre introuvable', 404);
  await removeConversationMember(conversationId, userId);
}

export async function leaveGroupService(user, conversationId) {
  const { conversation } = await assertConversationAccess(conversationId, user);
  if (conversation.type !== 'group') fail('Cette conversation n’est pas un groupe', 400);
  if (user.uid === conversation.createdBy) fail('Le créateur doit transférer la gestion du groupe avant de le quitter');
  await removeConversationMember(conversationId, user.uid);
}

export async function renameGroupService(user, conversationId, name) {
  const { conversation, member } = await assertConversationAccess(conversationId, user);
  if (conversation.type !== 'group') fail('Cette conversation n’est pas un groupe', 400);
  if (conversation.isCompanyGroup) fail('Le nom du groupe de l’entreprise ne peut pas être modifié', 403);
  if (member.role !== 'admin') fail('Seul l’administrateur du groupe peut modifier son nom', 403);
  const normalized = String(name || '').trim();
  if (!normalized) fail('Nom du groupe requis');
  if (normalized.length > MAX_GROUP_NAME_LENGTH) fail(`Le nom du groupe ne peut pas dépasser ${MAX_GROUP_NAME_LENGTH} caractères`);
  return updateConversation(conversationId, { name: normalized, updatedAt: nowIso() });
}

export async function deleteGroupService(user, conversationId) {
  const { conversation, member } = await assertConversationAccess(conversationId, user);
  if (conversation.type !== 'group') fail('Cette conversation n’est pas un groupe', 400);
  if (conversation.isCompanyGroup) fail('Le groupe de l’entreprise ne peut pas être supprimé', 403);
  if (member.role !== 'admin' || conversation.createdBy !== user.uid) fail('Seul le créateur du groupe peut le supprimer', 403);
  await deleteConversation(conversationId);
}
