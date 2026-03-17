const chatHandler = require('../sockets/chatHandler');
const groupChatHandler = require('../sockets/groupChatHandler');
const callHandler = require('../sockets/callHandler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = (io) => {
  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username}`);
    
    // Join user to their personal room
    socket.join(socket.user._id.toString());
    
    // Update user online status
    User.findByIdAndUpdate(socket.user._id, { online: true, lastSeen: new Date() })
      .then(() => {
        // Broadcast online status to friends
        socket.broadcast.emit('user_online', { userId: socket.user._id });
      });

    // Initialize chat handler
    chatHandler(io, socket);
    groupChatHandler(io, socket);
    callHandler(io, socket);

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.user.username}`);
      
      // Update user offline status
      await User.findByIdAndUpdate(socket.user._id, { 
        online: false, 
        lastSeen: new Date() 
      });
      
      // Broadcast offline status to friends
      socket.broadcast.emit('user_offline', { 
        userId: socket.user._id,
        lastSeen: new Date()
      });
    });
  });
};