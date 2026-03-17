const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createGroup,
  getGroups,
  getGroupDetails,
  updateGroup,
  addMembers,
  removeMember,
  getGroupMessages
} = require('../controllers/groupController');

router.use(protect);

router.post('/', createGroup);
router.get('/', getGroups);
router.get('/:groupId', getGroupDetails);
router.put('/:groupId', updateGroup);
router.post('/:groupId/members', addMembers);
router.delete('/:groupId/members/:userId', removeMember);
router.get('/:groupId/messages', getGroupMessages);

module.exports = router;
