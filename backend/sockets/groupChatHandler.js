const Message = require('../models/Message');
const Group = require('../models/Group');

module.exports = (io, socket) => {
  // Join all group rooms the user belongs to
  socket.on('join_groups', async () => {
    try {
      const groups = await Group.find({ members: socket.user._id });
      groups.forEach(group => {
        socket.join(`group_${group._id}`);
      });
    } catch (error) {
      console.error('Join groups error:', error);
    }
  });

  // Join specific group room
  socket.on('join_group', ({ groupId }) => {
    socket.join(`group_${groupId}`);
  });

  // Leave specific group room
  socket.on('leave_group', ({ groupId }) => {
    socket.leave(`group_${groupId}`);
  });

  // Send group message
  socket.on('send_group_message', async (data) => {
    try {
      const { groupId, messageType, messageContent, imageUrl, replyTo } = data;

      const group = await Group.findById(groupId);
      if (!group) return socket.emit('message_error', { error: 'Group not found' });

      if (!group.members.some(m => m.toString() === socket.user._id.toString())) {
        return socket.emit('message_error', { error: 'Not a member of this group' });
      }

      const message = await Message.create({
        senderId: socket.user._id,
        groupId,
        messageType: messageType || 'text',
        messageContent: messageContent || '',
        imageUrl: messageType === 'image' ? imageUrl : undefined,
        replyTo: replyTo || null,
        delivered: false,
        read: false
      });

      const populatedMessage = await Message.findById(message._id)
        .populate('senderId', 'username profilePicture')
        .populate({
          path: 'replyTo',
          select: 'messageContent messageType imageUrl senderId',
          populate: { path: 'senderId', select: 'username' }
        });

      io.to(`group_${groupId}`).emit('receive_group_message', {
        ...populatedMessage.toObject(),
        groupId
      });
    } catch (error) {
      console.error('Send group message error:', error);
      socket.emit('message_error', { error: 'Failed to send group message' });
    }
  });

  // Group typing indicator
  socket.on('group_typing', ({ groupId, isTyping }) => {
    socket.to(`group_${groupId}`).emit('group_user_typing', {
      groupId,
      userId: socket.user._id,
      username: socket.user.username,
      isTyping
    });
  });
};
