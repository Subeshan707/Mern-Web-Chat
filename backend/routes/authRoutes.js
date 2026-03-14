const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/register', upload.single('profilePicture'), register);
router.post('/login', login);
router.get('/me', protect, getMe);

module.exports = router;