const Message = require('../models/Message');
const Friend = require('../models/Friend');

// @desc    Get conversation between two users
// @route   GET /api/messages/:userId
// @access  Private
const getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    // Check if users are friends
    const areFriends = await Friend.findOne({
      $or: [
        { userId: req.user._id, friendId: userId },
        { userId: userId, friendId: req.user._id }
      ]
    });

    if (!areFriends) {
      return res.status(403).json({ message: 'You are not friends with this user' });
    }

    const skip = (page - 1) * limit;

    const messages = await Message.find({
      $or: [
        { senderId: req.user._id, receiverId: userId },
        { senderId: userId, receiverId: req.user._id }
      ]
    })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .populate('senderId', 'username profilePicture')
    .populate('receiverId', 'username profilePicture');

    const total = await Message.countDocuments({
      $or: [
        { senderId: req.user._id, receiverId: userId },
        { senderId: userId, receiverId: req.user._id }
      ]
    });

    res.json({
      messages: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Send a message (HTTP fallback)
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const messageType = req.body.messageType || 'text';
    const messageContent = req.body.messageContent && req.body.messageContent.trim();

    if (!receiverId) {
      return res.status(400).json({ message: 'receiverId is required' });
    }

    if (!['text', 'image'].includes(messageType)) {
      return res.status(400).json({ message: 'messageType must be text or image' });
    }

    if (messageType === 'text' && !messageContent) {
      return res.status(400).json({ message: 'messageContent is required for text messages' });
    }

    if (messageType === 'image' && !req.file) {
      return res.status(400).json({ message: 'messageImage is required for image messages' });
    }

    // Check if users are friends
    const areFriends = await Friend.findOne({
      $or: [
        { userId: req.user._id, friendId: receiverId },
        { userId: receiverId, friendId: req.user._id }
      ]
    });

    if (!areFriends) {
      return res.status(403).json({ message: 'You are not friends with this user' });
    }

    const messageData = {
      senderId: req.user._id,
      receiverId,
      messageType,
      messageContent: messageType === 'text' ? messageContent : '',
      imageUrl: messageType === 'image' && req.file ? `/uploads/message-images/${req.file.filename}` : undefined
    };

    const message = await Message.create(messageData);

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'username profilePicture')
      .populate('receiverId', 'username profilePicture');

    res.status(201).json(populatedMessage);

    // Emit real-time event to the conversation room
    const io = req.app.get('io');
    if (io) {
      const roomId = [req.user._id.toString(), receiverId.toString()].sort().join('_');
      io.to(roomId).emit('receive_message', populatedMessage);
    }
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Mark messages as read
// @route   PUT /api/messages/read/:userId
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const { userId } = req.params;

    await Message.updateMany(
      {
        senderId: userId,
        receiverId: req.user._id,
        read: false
      },
      { read: true, delivered: true }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get recent conversations
// @route   GET /api/messages/recent/conversations
// @access  Private
const getRecentConversations = async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: req.user._id },
            { receiverId: req.user._id }
          ]
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", req.user._id] },
              "$receiverId",
              "$senderId"
            ]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiverId", req.user._id] },
                    { $eq: ["$read", false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: "$user._id",
            username: "$user.username",
            profilePicture: "$user.profilePicture",
            online: "$user.online",
            lastSeen: "$user.lastSeen"
          },
          lastMessage: 1,
          unreadCount: 1
        }
      },
      {
        $sort: { "lastMessage.timestamp": -1 }
      }
    ]);

    res.json(conversations);
  } catch (error) {
    console.error('Get recent conversations error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getConversation,
  sendMessage,
  markAsRead,
  getRecentConversations
};