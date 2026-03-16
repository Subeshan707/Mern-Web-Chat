const express = require('express');
const router = express.Router();
const { 
  getConversation, 
  sendMessage, 
  deleteMessage,
  toggleStar,
  markAsRead,
  getRecentConversations,
  searchMessages
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/recent', protect, getRecentConversations);
router.get('/search/:userId', protect, searchMessages);
router.get('/:userId', protect, getConversation);
router.post('/', protect, upload.single('messageImage'), sendMessage);
router.put('/read/:userId', protect, markAsRead);
router.put('/star/:messageId', protect, toggleStar);
router.delete('/:messageId', protect, deleteMessage);

module.exports = router;