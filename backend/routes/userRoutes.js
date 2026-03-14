const express = require('express');
const router = express.Router();
const { searchUsers, getUserById, updateProfile } = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/search', protect, searchUsers);
router.get('/:userId', protect, getUserById);
router.put('/profile', protect, upload.single('profilePicture'), updateProfile);

module.exports = router;