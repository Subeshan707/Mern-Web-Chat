module.exports = (io, socket) => {
  // ── 1:1 Call Signaling ──

  // Initiate a call
  socket.on('call_initiate', ({ calleeId, callType, callerInfo }) => {
    const calleeRoom = calleeId?.toString();
    if (!calleeRoom) return;

    io.to(calleeRoom).emit('call_incoming', {
      callerId: socket.user._id.toString(),
      callerName: socket.user.username,
      callerPicture: socket.user.profilePicture,
      callType, // 'audio' or 'video'
      ...callerInfo
    });
  });

  // Accept a call
  socket.on('call_accept', ({ callerId }) => {
    const callerRoom = callerId?.toString();
    if (!callerRoom) return;

    io.to(callerRoom).emit('call_accepted', {
      acceptedBy: socket.user._id.toString(),
      acceptedByName: socket.user.username
    });
  });

  // Reject a call
  socket.on('call_reject', ({ callerId, reason }) => {
    const callerRoom = callerId?.toString();
    if (!callerRoom) return;

    io.to(callerRoom).emit('call_rejected', {
      rejectedBy: socket.user._id.toString(),
      reason: reason || 'declined'
    });
  });

  // End a call
  socket.on('call_end', ({ peerId }) => {
    const peerRoom = peerId?.toString();
    if (!peerRoom) return;

    io.to(peerRoom).emit('call_ended', {
      endedBy: socket.user._id.toString()
    });
  });

  // WebRTC signaling: offer
  socket.on('webrtc_offer', ({ targetId, offer }) => {
    const targetRoom = targetId?.toString();
    if (!targetRoom) return;

    io.to(targetRoom).emit('webrtc_offer', {
      fromId: socket.user._id.toString(),
      offer
    });
  });

  // WebRTC signaling: answer
  socket.on('webrtc_answer', ({ targetId, answer }) => {
    const targetRoom = targetId?.toString();
    if (!targetRoom) return;

    io.to(targetRoom).emit('webrtc_answer', {
      fromId: socket.user._id.toString(),
      answer
    });
  });

  // WebRTC signaling: ICE candidate
  socket.on('webrtc_ice_candidate', ({ targetId, candidate }) => {
    const targetRoom = targetId?.toString();
    if (!targetRoom) return;

    io.to(targetRoom).emit('webrtc_ice_candidate', {
      fromId: socket.user._id.toString(),
      candidate
    });
  });

  // ── Group Call Signaling ──

  // Initiate a group call
  socket.on('group_call_initiate', ({ groupId, callType, memberIds }) => {
    socket.join(`call_${groupId}`);

    // Notify all group members except the caller
    memberIds.forEach(memberId => {
      if (memberId.toString() !== socket.user._id.toString()) {
        io.to(memberId.toString()).emit('group_call_incoming', {
          groupId,
          callerId: socket.user._id,
          callerName: socket.user.username,
          callerPicture: socket.user.profilePicture,
          callType
        });
      }
    });
  });

  // Join a group call
  socket.on('group_call_join', ({ groupId }) => {
    socket.join(`call_${groupId}`);

    // Tell everyone in the call room that this user joined
    socket.to(`call_${groupId}`).emit('group_call_user_joined', {
      userId: socket.user._id,
      username: socket.user.username,
      profilePicture: socket.user.profilePicture
    });
  });

  // Leave a group call
  socket.on('group_call_leave', ({ groupId }) => {
    socket.to(`call_${groupId}`).emit('group_call_user_left', {
      userId: socket.user._id
    });
    socket.leave(`call_${groupId}`);
  });

  // Group call WebRTC offer (to a specific peer in the call)
  socket.on('group_call_offer', ({ targetId, groupId, offer }) => {
    io.to(targetId).emit('group_call_offer', {
      fromId: socket.user._id,
      groupId,
      offer
    });
  });

  // Group call WebRTC answer
  socket.on('group_call_answer', ({ targetId, groupId, answer }) => {
    io.to(targetId).emit('group_call_answer', {
      fromId: socket.user._id,
      groupId,
      answer
    });
  });

  // Group call ICE candidate
  socket.on('group_call_ice_candidate', ({ targetId, groupId, candidate }) => {
    io.to(targetId).emit('group_call_ice_candidate', {
      fromId: socket.user._id,
      groupId,
      candidate
    });
  });
};
