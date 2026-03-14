const Friend = require('../models/Friend');
const User = require('../models/User');

// @desc    Add a friend
// @route   POST /api/friends/add
// @access  Private
const addFriend = async (req, res) => {
  try {
    const username = req.body.username && req.body.username.trim();

    if (!username) {
      return res.status(400).json({ message: 'username is required' });
    }

    // Find user by username
    const friend = await User.findOne({ username });
    if (!friend) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if trying to add self
    if (friend._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot add yourself as a friend' });
    }

    // Check if friendship already exists
    const existingFriendship = await Friend.findOne({
      $or: [
        { userId: req.user._id, friendId: friend._id },
        { userId: friend._id, friendId: req.user._id }
      ]
    });

    if (existingFriendship) {
      return res.status(400).json({ message: 'Already friends with this user' });
    }

    // Create friendship
    const friendship = await Friend.create({
      userId: req.user._id,
      friendId: friend._id
    });

    // Create reverse friendship for bidirectional lookup
    await Friend.create({
      userId: friend._id,
      friendId: req.user._id
    });

    res.status(201).json({
      message: 'Friend added successfully',
      friend: {
        _id: friend._id,
        username: friend.username,
        profilePicture: friend.profilePicture,
        online: friend.online,
        lastSeen: friend.lastSeen
      }
    });
  } catch (error) {
    console.error('Add friend error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get user's friends list
// @route   GET /api/friends
// @access  Private
const getFriends = async (req, res) => {
  try {
    const friends = await Friend.find({ userId: req.user._id })
      .populate('friendId', 'username profilePicture online lastSeen')
      .sort({ createdAt: -1 });

    res.json(friends.map(f => ({
      _id: f.friendId._id,
      username: f.friendId.username,
      profilePicture: f.friendId.profilePicture,
      online: f.friendId.online,
      lastSeen: f.friendId.lastSeen,
      friendshipSince: f.createdAt
    })));
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Remove a friend
// @route   DELETE /api/friends/:friendId
// @access  Private
const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;

    // Delete both sides of friendship
    const result = await Friend.deleteMany({
      $or: [
        { userId: req.user._id, friendId },
        { userId: friendId, friendId: req.user._id }
      ]
    });

    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Friendship not found' });
    }

    res.json({ message: 'Friend removed successfully' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Check friendship status
// @route   GET /api/friends/status/:userId
// @access  Private
const checkFriendship = async (req, res) => {
  try {
    const { userId } = req.params;

    const friendship = await Friend.findOne({
      userId: req.user._id,
      friendId: userId
    });

    res.json({ areFriends: !!friendship });
  } catch (error) {
    console.error('Check friendship error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  addFriend,
  getFriends,
  removeFriend,
  checkFriendship
};