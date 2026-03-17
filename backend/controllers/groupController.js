const Group = require('../models/Group');
const Message = require('../models/Message');
const User = require('../models/User');

// @desc    Create a new group
// @route   POST /api/groups
// @access  Private
const createGroup = async (req, res) => {
  try {
    const { name, description, memberIds } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length < 1) {
      return res.status(400).json({ message: 'At least one member is required' });
    }

    // Always include creator in members and admins
    const allMembers = [...new Set([req.user._id.toString(), ...memberIds])];

    const group = await Group.create({
      name: name.trim(),
      description: description || '',
      members: allMembers,
      admins: [req.user._id],
      createdBy: req.user._id
    });

    const populated = await Group.findById(group._id)
      .populate('members', 'username profilePicture online lastSeen about')
      .populate('admins', 'username profilePicture')
      .populate('createdBy', 'username profilePicture');

    // Notify all members via socket
    const io = req.app.get('io');
    if (io) {
      allMembers.forEach(memberId => {
        io.to(memberId.toString()).emit('group_created', populated);
      });
    }

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all groups for the current user
// @route   GET /api/groups
// @access  Private
const getGroups = async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user._id })
      .populate('members', 'username profilePicture online lastSeen about')
      .populate('admins', 'username profilePicture')
      .populate('createdBy', 'username profilePicture')
      .sort({ updatedAt: -1 });

    // Get last message for each group
    const groupsWithLastMsg = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await Message.findOne({ groupId: group._id })
          .sort({ timestamp: -1 })
          .populate('senderId', 'username profilePicture');

        const unreadCount = await Message.countDocuments({
          groupId: group._id,
          senderId: { $ne: req.user._id },
          read: false
        });

        return {
          ...group.toObject(),
          lastMessage,
          unreadCount
        };
      })
    );

    res.json(groupsWithLastMsg);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get group details
// @route   GET /api/groups/:groupId
// @access  Private
const getGroupDetails = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('members', 'username profilePicture online lastSeen about')
      .populate('admins', 'username profilePicture')
      .populate('createdBy', 'username profilePicture');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.some(m => m._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    res.json(group);
  } catch (error) {
    console.error('Get group details error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update group info
// @route   PUT /api/groups/:groupId
// @access  Private (admin only)
const updateGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.admins.some(a => a.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Only admins can update the group' });
    }

    const { name, description } = req.body;
    if (name) group.name = name.trim();
    if (description !== undefined) group.description = description;

    await group.save();

    const populated = await Group.findById(group._id)
      .populate('members', 'username profilePicture online lastSeen about')
      .populate('admins', 'username profilePicture')
      .populate('createdBy', 'username profilePicture');

    // Notify members
    const io = req.app.get('io');
    if (io) {
      group.members.forEach(memberId => {
        io.to(memberId.toString()).emit('group_updated', populated);
      });
    }

    res.json(populated);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add members to group
// @route   POST /api/groups/:groupId/members
// @access  Private (admin only)
const addMembers = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.admins.some(a => a.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Only admins can add members' });
    }

    const { memberIds } = req.body;
    if (!memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ message: 'memberIds array is required' });
    }

    const newMembers = memberIds.filter(
      id => !group.members.some(m => m.toString() === id.toString())
    );

    group.members.push(...newMembers);
    await group.save();

    const populated = await Group.findById(group._id)
      .populate('members', 'username profilePicture online lastSeen about')
      .populate('admins', 'username profilePicture')
      .populate('createdBy', 'username profilePicture');

    const io = req.app.get('io');
    if (io) {
      group.members.forEach(memberId => {
        io.to(memberId.toString()).emit('group_updated', populated);
      });
      newMembers.forEach(memberId => {
        io.to(memberId.toString()).emit('group_created', populated);
      });
    }

    res.json(populated);
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Remove member from group
// @route   DELETE /api/groups/:groupId/members/:userId
// @access  Private (admin or self)
const removeMember = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const isAdmin = group.admins.some(a => a.toString() === req.user._id.toString());
    const isSelf = req.params.userId === req.user._id.toString();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    group.members = group.members.filter(m => m.toString() !== req.params.userId);
    group.admins = group.admins.filter(a => a.toString() !== req.params.userId);

    if (group.members.length === 0) {
      await Group.findByIdAndDelete(group._id);
      return res.json({ message: 'Group deleted (no members left)' });
    }

    // If no admins left, make first member admin
    if (group.admins.length === 0) {
      group.admins.push(group.members[0]);
    }

    await group.save();

    const populated = await Group.findById(group._id)
      .populate('members', 'username profilePicture online lastSeen about')
      .populate('admins', 'username profilePicture')
      .populate('createdBy', 'username profilePicture');

    const io = req.app.get('io');
    if (io) {
      io.to(req.params.userId).emit('group_removed', { groupId: group._id });
      group.members.forEach(memberId => {
        io.to(memberId.toString()).emit('group_updated', populated);
      });
    }

    res.json(populated);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get group messages
// @route   GET /api/groups/:groupId/messages
// @access  Private
const getGroupMessages = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (!group.members.some(m => m.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      groupId: req.params.groupId,
      deletedFor: { $ne: req.user._id }
    })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'username profilePicture')
      .populate({
        path: 'replyTo',
        select: 'messageContent messageType imageUrl senderId',
        populate: { path: 'senderId', select: 'username' }
      });

    const total = await Message.countDocuments({
      groupId: req.params.groupId,
      deletedFor: { $ne: req.user._id }
    });

    res.json({
      messages: messages.reverse(),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  createGroup,
  getGroups,
  getGroupDetails,
  updateGroup,
  addMembers,
  removeMember,
  getGroupMessages
};
