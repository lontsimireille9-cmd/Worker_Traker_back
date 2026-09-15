import { db } from '../config/firebase.js';

const conversations = db.collection('conversations');
const members = db.collection('conversation_members');
const messages = db.collection('messages');

export function conversationRef(id) { return conversations.doc(id); }
export function memberRef(conversationId, userId) { return members.doc(`${conversationId}_${userId}`); }

export async function findConversationById(id) {
  const snap = await conversationRef(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function findMember(conversationId, userId) {
  const snap = await memberRef(conversationId, userId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

export async function listUserMemberships(userId) {
  const snap = await members.where('userId', '==', userId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function listUserConversations(userId) {
  const membershipList = await listUserMemberships(userId);
  if (!membershipList.length) return [];
  const conversationSnaps = await db.getAll(...membershipList.map((membership) => conversationRef(membership.conversationId)));
  return membershipList.map((membership, index) => ({
    membership,
    conversation: conversationSnaps[index].exists
      ? { id: conversationSnaps[index].id, ...conversationSnaps[index].data() }
      : null,
  }));
}

export async function listConversationMembers(conversationId) {
  const snap = await members.where('conversationId', '==', conversationId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function findPrivateConversation(id) {
  return findConversationById(id);
}

export async function createConversationWithMembers(conversation, memberList) {
  const batch = db.batch();
  const ref = conversationRef(conversation.id);
  const { id, ...data } = conversation;
  batch.set(ref, data);
  memberList.forEach((member) => {
    const memberId = `${id}_${member.userId}`;
    batch.set(members.doc(memberId), member);
  });
  await batch.commit();
  return { id, ...data };
}

export async function createConversationTransaction(conversation, memberList) {
  return db.runTransaction(async (transaction) => {
    const ref = conversationRef(conversation.id);
    const existing = await transaction.get(ref);
    if (existing.exists) return { id: ref.id, ...existing.data(), existed: true };
    const { id, ...data } = conversation;
    transaction.set(ref, data);
    memberList.forEach((member) => {
      transaction.set(members.doc(`${id}_${member.userId}`), member);
    });
    return { id, ...data, existed: false };
  });
}

export async function updateConversation(id, data) {
  await conversationRef(id).update(data);
  return findConversationById(id);
}

export async function updateMember(conversationId, userId, data) {
  await memberRef(conversationId, userId).update(data);
  return findMember(conversationId, userId);
}

export async function addConversationMember(member) {
  await memberRef(member.conversationId, member.userId).set(member, { merge: true });
  return findMember(member.conversationId, member.userId);
}

export async function removeConversationMember(conversationId, userId) {
  await memberRef(conversationId, userId).delete();
}

export async function deleteConversation(id) {
  const memberList = await listConversationMembers(id);
  const messageSnap = await messages.where('conversationId', '==', id).get();
  let batch = db.batch();
  let operations = 0;
  const commitIfNeeded = async () => {
    if (operations >= 450) {
      await batch.commit();
      batch = db.batch();
      operations = 0;
    }
  };
  batch.delete(conversationRef(id)); operations += 1;
  for (const member of memberList) { batch.delete(memberRef(id, member.userId)); operations += 1; await commitIfNeeded(); }
  for (const doc of messageSnap.docs) { batch.delete(doc.ref); operations += 1; await commitIfNeeded(); }
  if (operations) await batch.commit();
}

export async function listMessages(conversationId, limit = 30, before = null) {
  let query = messages.where('conversationId', '==', conversationId).orderBy('createdAt', 'desc').limit(limit);
  if (before) query = query.startAfter(before);
  try {
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    if (error.code !== 9) throw error;
    const snap = await messages.where('conversationId', '==', conversationId).get();
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    const filtered = before
      ? items.filter((message) => String(message.createdAt || '') < String(before))
      : items;
    return filtered.slice(0, limit);
  }
}

export async function createMessageWithUnread(message, memberList) {
  return db.runTransaction(async (transaction) => {
    const conversationSnap = await transaction.get(conversationRef(message.conversationId));
    if (!conversationSnap.exists) throw Object.assign(new Error('Conversation introuvable'), { status: 404 });

    const recipientRefs = memberList
      .filter((member) => member.userId !== message.senderId)
      .map((member) => memberRef(message.conversationId, member.userId));
    const recipientSnaps = recipientRefs.length ? await transaction.getAll(...recipientRefs) : [];

    const messageRef = messages.doc();
    transaction.set(messageRef, { ...message, id: messageRef.id, deliveredAt: recipientRefs.length ? message.createdAt : null, readAt: null });
    transaction.update(conversationRef(message.conversationId), {
      lastMessage: message.content,
      lastMessageAt: message.createdAt,
      lastMessageSenderId: message.senderId,
      updatedAt: message.createdAt,
    });

    recipientSnaps.forEach((snap, index) => {
      if (!snap.exists) return;
      const currentData = snap.data() || {};
      transaction.update(recipientRefs[index], { unreadCount: Number(currentData.unreadCount || 0) + 1 });
    });

    return { id: messageRef.id, ...message };
  });
}
