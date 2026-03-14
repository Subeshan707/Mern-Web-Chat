const express = require('express');
const router = express.Router();
const { 
  getConversation, 
  sendMessage, 
  markAsRead,
  getRecentConversations 
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/recent', protect, getRecentConversations);
router.get('/:userId', protect, getConversation);
router.post('/', protect, upload.single('messageImage'), sendMessage);
router.put('/read/:userId', protect, markAsRead);

module.exports = router;