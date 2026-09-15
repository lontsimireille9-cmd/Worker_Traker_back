import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  addMember, createGroup, createPrivateConversation, deleteGroup, getConversation, leaveGroup,
  listConversations, listMessages, markRead, registerMessagingToken, removeMember, renameGroup, searchUsers, sendMessage,
} from '../controllers/messages.controller.js';
import {
  groupNameValidator, groupValidator, memberValidator, messageValidator,
  privateConversationValidator, searchValidator, validateMessageRequest,
} from '../validators/messages.validators.js';

const router = Router();
router.use(requireAuth);

router.get('/conversations', listConversations);
router.get('/users/search', searchValidator, validateMessageRequest, searchUsers);
router.post('/users/device-token', registerMessagingToken);
router.get('/conversations/:id', getConversation);
router.post('/conversations/private', privateConversationValidator, validateMessageRequest, createPrivateConversation);
router.post('/conversations', groupValidator, validateMessageRequest, createGroup);
router.get('/conversations/:id/messages', listMessages);
router.post('/conversations/:id/messages', messageValidator, validateMessageRequest, sendMessage);
router.post('/conversations/:id/read', markRead);
router.post('/conversations/:id/members', memberValidator, validateMessageRequest, addMember);
router.delete('/conversations/:id/members/:userId', removeMember);
router.post('/conversations/:id/leave', leaveGroup);
router.patch('/conversations/:id', groupNameValidator, validateMessageRequest, renameGroup);
router.delete('/conversations/:id', deleteGroup);

export default router;
