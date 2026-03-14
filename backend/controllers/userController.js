const User = require('../models/User');
const Friend = require('../models/Friend');

// @desc    Search users by username
// @route   GET /api/users/search
// @access  Private
const searchUsers = async (req, res) => {
  try {
    const query = req.query.query && req.query.query.trim();
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: req.user._id } // Exclude current user
    }).select('username profilePicture online lastSeen').limit(10);

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:userId
// @access  Private
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username profilePicture online lastSeen');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const username = req.body.username && req.body.username.trim();
    const updates = {};

    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Username is already taken' });
      }

      updates.username = username;
    }
    if (req.file) updates.profilePicture = `/uploads/profile-pictures/${req.file.filename}`;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'No profile updates provided' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  searchUsers,
  getUserById,
  updateProfile
};