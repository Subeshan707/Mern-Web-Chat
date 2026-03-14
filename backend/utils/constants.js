module.exports = {
  MESSAGE_TYPES: {
    TEXT: 'text',
    IMAGE: 'image'
  },
  
  FRIEND_STATUS: {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    BLOCKED: 'blocked'
  },

  SOCKET_EVENTS: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    JOIN_CONVERSATION: 'join_conversation',
    LEAVE_CONVERSATION: 'leave_conversation',
    SEND_MESSAGE: 'send_message',
    RECEIVE_MESSAGE: 'receive_message',
    TYPING: 'typing',
    USER_TYPING: 'user_typing',
    MARK_READ: 'mark_read',
    MESSAGES_READ: 'messages_read',
    MESSAGE_DELIVERED: 'message_delivered',
    USER_ONLINE: 'user_online',
    USER_OFFLINE: 'user_offline'
  },

  FILE_LIMITS: {
    PROFILE_PICTURE: 2 * 1024 * 1024, // 2MB
    MESSAGE_IMAGE: 5 * 1024 * 1024 // 5MB
  }
};