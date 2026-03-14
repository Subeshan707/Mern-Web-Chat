const express = require('express');
const router = express.Router();
const { 
  addFriend, 
  getFriends, 
  removeFriend,
  checkFriendship 
} = require('../controllers/friendController');
const { protect } = require('../middleware/auth');

router.post('/add', protect, addFriend);
router.get('/', protect, getFriends);
router.get('/status/:userId', protect, checkFriendship);
router.delete('/:friendId', protect, removeFriend);

module.exports = router;