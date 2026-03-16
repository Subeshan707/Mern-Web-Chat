const Message = require('../models/Message');
const User = require('../models/User');

module.exports = (io, socket) => {
  // Join conversation room
  socket.on('join_conversation', ({ userId }) => {
    const roomId = [socket.user._id.toString(), userId.toString()].sort().join('_');
    socket.join(roomId);
    console.log(`${socket.user.username} joined room: ${roomId}`);
  });

  // Leave conversation room
  socket.on('leave_conversation', ({ userId }) => {
    const roomId = [socket.user._id.toString(), userId.toString()].sort().join('_');
    socket.leave(roomId);
  });

  // Send message
  socket.on('send_message', async (data) => {
    try {
      const { receiverId, messageType, messageContent, imageUrl } = data;

      // Create message in database
      const message = await Message.create({
        senderId: socket.user._id,
        receiverId,
        messageType,
        messageContent: messageType === 'text' ? messageContent : '',
        imageUrl: messageType === 'image' ? imageUrl : undefined,
        delivered: false,
        read: false
      });

      // Populate sender info
      const populatedMessage = await Message.findById(message._id)
        .populate('senderId', 'username profilePicture')
        .populate('receiverId', 'username profilePicture');

      // Create room ID for conversation
      const roomId = [socket.user._id.toString(), receiverId.toString()].sort().join('_');

      // Emit to room (both sender and receiver)
      io.to(roomId).emit('receive_message', populatedMessage);

      // Check if receiver is online
      const receiver = await User.findById(receiverId);
      if (receiver && receiver.online) {
        // Update delivered status
        await Message.findByIdAndUpdate(message._id, { delivered: true });
        
        // Notify about new message
        io.to(receiverId.toString()).emit('new_message_notification', {
          fromUser: {
            _id: socket.user._id,
            username: socket.user.username,
            profilePicture: socket.user.profilePicture
          },
          message: populatedMessage
        });
      }

    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('message_error', { error: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing', ({ receiverId, isTyping }) => {
    const roomId = [socket.user._id.toString(), receiverId.toString()].sort().join('_');
    socket.to(roomId).emit('user_typing', {
      userId: socket.user._id,
      username: socket.user.username,
      isTyping
    });
  });

  // Mark messages as read
  socket.on('mark_read', async ({ senderId }) => {
    try {
      await Message.updateMany(
        {
          senderId,
          receiverId: socket.user._id,
          read: false
        },
        { read: true }
      );

      // Notify sender that messages were read
      io.to(senderId.toString()).emit('messages_read', {
        readerId: socket.user._id,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Mark read error:', error);
    }
  });

  // Message delivered
  socket.on('message_delivered', async ({ messageId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, { delivered: true });
    } catch (error) {
      console.error('Message delivered error:', error);
    }
  });
};