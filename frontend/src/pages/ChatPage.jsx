import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { api } from "../api/chatApi";
import { useAuth } from "../context/AuthContext";
import CallOverlay from "../components/CallOverlay";
import GroupCallOverlay from "../components/GroupCallOverlay";
import CreateGroupDialog from "../components/CreateGroupDialog";
import GroupInfoPanel from "../components/GroupInfoPanel";
import { useWebRTC } from "../hooks/useWebRTC";

const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const EMOJIS = [
  "😀","😂","😍","🥰","😘","😎","🤩","😊","🙂","😇",
  "🤔","😏","😌","🥳","😋","🤗","😜","😝","🤑","🤭",
  "😶","🙄","😬","😮","😲","😱","🤯","😢","😭","😤",
  "🤬","🥺","😈","👻","💀","☠️","👽","🤖","💩","🎃",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️",
  "💕","💗","💖","💘","💝","💞","👍","👎","👏","🙌",
  "🤝","🙏","💪","✌️","🤞","🤟","🤘","👌","🤙","👋",
  "✍️","🤳","💅","🖖","👆","👇","👈","👉","☝️","🖕",
  "🔥","✨","🌟","💫","⭐","🌈","☀️","🌙","⚡","💥",
  "🎉","🎊","🎈","🎁","🎂","🍕","🍔","☕","🍷","🍺"
];

function byNewest(a, b) {
  return new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0);
}

function formatLastSeen(date) {
  if (!date) return "last seen recently";
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  
  if (mins < 1) return "last seen just now";
  if (mins < 60) return `last seen ${mins}m ago`;
  if (hrs < 24) {
    return `last seen today at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `last seen yesterday at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `last seen ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatMsgTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateSeparator(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "TODAY";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }).toUpperCase();
}

export default function ChatPage() {
  const { user, token, logout, updateCurrentUser } = useAuth();
  const socketRef = useRef(null);
  const lastPeerIdRef = useRef(null);
  const typingTimerRef = useRef(null);
  const selectedUserRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedGroupRef = useRef(null);
  const groupCallLocalStreamRef = useRef(null);
  const groupCallGroupIdRef = useRef(null);

  const [friends, setFriends] = useState([]);
  const [recentConversations, setRecentConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [draft, setDraft] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [typingLabel, setTypingLabel] = useState("");
  const [isBusy, setIsBusy] = useState({ friends: false, messages: false, send: false, profile: false });
  const [error, setError] = useState("");

  // New feature states
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [msgSearch, setMsgSearch] = useState("");
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearchResults, setMsgSearchResults] = useState([]);
  const [lightboxImg, setLightboxImg] = useState(null);

  // ── Group states ──
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // ── Call states ──
  const [callState, setCallState] = useState(null); // 'incoming'|'outgoing'|'connected'
  const [callType, setCallType] = useState('audio');
  const [callPeer, setCallPeer] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const incomingOfferRef = useRef(null);
  const callTypeRef = useRef('audio');
  const callPeerRef = useRef(null);

  // ── Group call states ──
  const [groupCallState, setGroupCallState] = useState(null);
  const [groupCallType, setGroupCallType] = useState('audio');
  const [groupCallGroupId, setGroupCallGroupId] = useState(null);
  const [groupCallParticipants, setGroupCallParticipants] = useState([]);
  const [groupCallLocalStream, setGroupCallLocalStream] = useState(null);
  const groupCallPcsRef = useRef({});

  const webrtc = useWebRTC(socketRef);

  const peerMap = useMemo(() => {
    const fromFriends = friends.map((f) => [f._id, f]);
    const fromRecent = recentConversations.map((c) => [c.user._id, c.user]);
    return new Map([...fromFriends, ...fromRecent]);
  }, [friends, recentConversations]);

  // ── Image preview handling ──
  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    loadFriendsAndRecents();
  }, []);

  // ── Socket listeners ──
  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_BASE_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on("connect_error", () => {
      setError("Socket authentication failed. Please log in again.");
    });

    socket.on("receive_message", (message) => {
      const peerId =
        message.senderId._id === user._id ? message.receiverId._id : message.senderId._id;
      if (selectedUserRef.current?._id === peerId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
      void refreshRecents();
    });

    socket.on("user_online", ({ userId }) => {
      updateUserPresence(userId, true, new Date().toISOString());
    });

    socket.on("user_offline", ({ userId, lastSeen }) => {
      updateUserPresence(userId, false, lastSeen || new Date().toISOString());
    });

    socket.on("user_typing", ({ userId, username, isTyping }) => {
      if (selectedUserRef.current?._id === userId) {
        setTypingLabel(isTyping ? `${username} is typing...` : "");
      }
    });

    socket.on("messages_read", ({ readerId }) => {
      if (selectedUserRef.current?._id === readerId) {
        setMessages((prev) =>
          prev.map((m) =>
            (typeof m.senderId === "string" ? m.senderId : m.senderId?._id) === user._id
              ? { ...m, read: true, delivered: true }
              : m
          )
        );
      }
    });

    socket.on("message_deleted", ({ messageId, forEveryone }) => {
      if (forEveryone) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === messageId
              ? { ...m, deletedForEveryone: true, messageContent: "", imageUrl: "" }
              : m
          )
        );
      }
    });

    // ── Group socket listeners ──
    socket.on("connect", () => {
      socket.emit("join_groups");
    });

    socket.on("receive_group_message", (message) => {
      if (selectedGroupRef.current?._id === message.groupId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === message._id)) return prev;
          return [...prev, message];
        });
      }
      loadGroups();
    });

    socket.on("group_created", (group) => {
      setGroups((prev) => {
        if (prev.some((g) => g._id === group._id)) return prev;
        return [group, ...prev];
      });
      socket.emit("join_group", { groupId: group._id });
    });

    socket.on("group_updated", (group) => {
      setGroups((prev) => prev.map((g) => (g._id === group._id ? { ...group, lastMessage: g.lastMessage, unreadCount: g.unreadCount } : g)));
      if (selectedGroupRef.current?._id === group._id) {
        setSelectedGroup(group);
      }
    });

    socket.on("group_removed", ({ groupId }) => {
      setGroups((prev) => prev.filter((g) => g._id !== groupId));
      if (selectedGroupRef.current?._id === groupId) {
        setSelectedGroup(null);
        setMessages([]);
      }
    });

    socket.on("group_user_typing", ({ groupId, userId, username, isTyping }) => {
      if (selectedGroupRef.current?._id === groupId && userId !== user._id) {
        setTypingLabel(isTyping ? `${username} is typing...` : "");
      }
    });

    // ── 1:1 Call listeners ──
    socket.on("call_incoming", ({ callerId, callerName, callerPicture, callType: ct }) => {
      setCallPeer({ _id: callerId, username: callerName, profilePicture: callerPicture });
      setCallType(ct);
      setCallState("incoming");
    });

    // Caller receives this after callee accepts → NOW send the WebRTC offer
    socket.on("call_accepted", async ({ acceptedBy }) => {
      setCallState("connected");
      try {
        await webrtc.sendOffer(acceptedBy);
      } catch (err) {
        console.error("Failed to send offer after acceptance:", err);
      }
    });

    socket.on("call_rejected", () => {
      webrtc.cleanup();
      setCallState(null);
      setCallPeer(null);
      setLocalStream(null);
      setRemoteStream(null);
    });

    socket.on("call_ended", () => {
      webrtc.cleanup();
      setCallState(null);
      setCallPeer(null);
      setLocalStream(null);
      setRemoteStream(null);
    });

    // Callee receives the offer AFTER they already accepted
    socket.on("webrtc_offer", async ({ fromId, offer }) => {
      incomingOfferRef.current = offer;
      // Auto-answer: callee has already accepted, so answer the WebRTC offer now
      try {
        const stream = await webrtc.answerCall(fromId, offer, callTypeRef.current === "video", (rs) => setRemoteStream(rs));
        setLocalStream(stream);
      } catch (err) {
        console.error("Auto-answer error:", err);
      }
    });

    socket.on("webrtc_answer", ({ answer }) => {
      webrtc.handleAnswer(answer);
    });

    socket.on("webrtc_ice_candidate", ({ candidate }) => {
      webrtc.handleIceCandidate(candidate);
    });

    // ── Group Call listeners ──
    socket.on("group_call_incoming", ({ groupId, callerName, callType: ct }) => {
      setGroupCallGroupId(groupId);
      setGroupCallType(ct);
      setGroupCallState("incoming");
      setCallPeer({ username: callerName });
    });

    socket.on("group_call_user_joined", ({ userId, username, profilePicture }) => {
      setGroupCallParticipants((prev) => {
        if (prev.some((p) => p.userId === userId)) return prev;
        return [...prev, { userId, username, profilePicture, stream: null }];
      });
    });

    socket.on("group_call_user_left", ({ userId }) => {
      setGroupCallParticipants((prev) => prev.filter((p) => p.userId !== userId));
      if (groupCallPcsRef.current[userId]) {
        groupCallPcsRef.current[userId].close();
        delete groupCallPcsRef.current[userId];
      }
    });

    socket.on("group_call_offer", async ({ fromId, offer }) => {
      try {
        const stream = groupCallLocalStreamRef.current;
        if (!stream) return;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        groupCallPcsRef.current[fromId] = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = (e) => {
          const rs = new MediaStream();
          rs.addTrack(e.track);
          setGroupCallParticipants((prev) => prev.map((p) => p.userId === fromId ? { ...p, stream: rs } : p));
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit("group_call_ice_candidate", { targetId: fromId, groupId: groupCallGroupIdRef.current, candidate: e.candidate });
        };
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("group_call_answer", { targetId: fromId, groupId: groupCallGroupIdRef.current, answer });
      } catch (err) { console.error("group_call_offer handler error:", err); }
    });

    socket.on("group_call_answer", async ({ fromId, answer }) => {
      const pc = groupCallPcsRef.current[fromId];
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("group_call_ice_candidate", async ({ fromId, candidate }) => {
      const pc = groupCallPcsRef.current[fromId];
      if (pc) try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    });

    return () => {
      if (lastPeerIdRef.current && socketRef.current) {
        socketRef.current.emit("leave_conversation", { userId: lastPeerIdRef.current });
      }
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line
  }, [token]);

  // ── Search users ──
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.searchUsers(searchQuery);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Search messages in conversation ──
  useEffect(() => {
    if (!msgSearch.trim() || !selectedUser) {
      setMsgSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.searchMessages(selectedUser._id, msgSearch);
        setMsgSearchResults(data);
      } catch {
        setMsgSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [msgSearch, selectedUser]);

  // ── Close context menu on click outside ──
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // ── Close emoji on click outside ──
  useEffect(() => {
    if (!showEmoji) return;
    const handler = (e) => {
      if (!e.target.closest(".emoji-panel") && !e.target.closest(".composer-emoji-btn")) {
        setShowEmoji(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [showEmoji]);

  const updateUserPresence = (userId, online, lastSeen) => {
    setFriends((prev) =>
      prev.map((friend) =>
        friend._id === userId ? { ...friend, online, lastSeen: lastSeen || friend.lastSeen } : friend
      )
    );

    setRecentConversations((prev) =>
      prev.map((item) =>
        item.user._id === userId
          ? { ...item, user: { ...item.user, online, lastSeen: lastSeen || item.user.lastSeen } }
          : item
      )
    );
  };

  const loadFriendsAndRecents = async () => {
    setIsBusy((prev) => ({ ...prev, friends: true }));
    setError("");

    try {
      const [friendsRes, recentRes] = await Promise.all([api.getFriends(), api.getRecentConversations()]);
      setFriends((friendsRes.data || []).sort(byNewest));
      setRecentConversations(recentRes.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load your chat data.");
    } finally {
      setIsBusy((prev) => ({ ...prev, friends: false }));
    }
  };

  const refreshRecents = async () => {
    const { data } = await api.getRecentConversations();
    setRecentConversations(data || []);
  };

  const loadGroups = async () => {
    try {
      const { data } = await api.getGroups();
      setGroups(data || []);
    } catch {}
  };

  // Load groups on mount
  useEffect(() => { loadGroups(); }, []);

  // Keep refs in sync
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);
  useEffect(() => { groupCallGroupIdRef.current = groupCallGroupId; }, [groupCallGroupId]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);
  useEffect(() => { callPeerRef.current = callPeer; }, [callPeer]);

  const openGroupConversation = async (group) => {
    setSelectedUser(null);
    selectedUserRef.current = null;
    setSelectedGroup(group);
    setTypingLabel("");
    setReplyingTo(null);
    setShowMsgSearch(false);
    setMsgSearch("");
    setShowContactInfo(false);
    setShowGroupInfo(false);
    setIsBusy((prev) => ({ ...prev, messages: true }));

    try {
      const { data } = await api.getGroupMessages(group._id, 1, 50);
      setMessages(data.messages || []);
      if (socketRef.current) {
        socketRef.current.emit("join_group", { groupId: group._id });
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load group messages.");
    } finally {
      setIsBusy((prev) => ({ ...prev, messages: false }));
    }
  };

  const onCreateGroup = async ({ name, memberIds }) => {
    try {
      await api.createGroup({ name, memberIds });
      setShowCreateGroup(false);
      await loadGroups();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not create group.");
    }
  };

  const onRemoveGroupMember = async (memberId) => {
    if (!selectedGroup) return;
    try {
      const { data } = await api.removeGroupMember(selectedGroup._id, memberId);
      setSelectedGroup(data);
      loadGroups();
    } catch (err) {
      setError("Could not remove member.");
    }
  };

  const onLeaveGroup = async () => {
    if (!selectedGroup) return;
    try {
      await api.removeGroupMember(selectedGroup._id, user._id);
      setSelectedGroup(null);
      setMessages([]);
      setShowGroupInfo(false);
      loadGroups();
    } catch (err) {
      setError("Could not leave group.");
    }
  };

  // ── Call handlers ──
  const initiateCall = async (peer, type) => {
    setCallPeer(peer);
    setCallType(type);
    setCallState("outgoing");
    try {
      // Prepare local media + peer connection, but DON'T send the offer yet.
      // The offer is sent only after the callee accepts (see call_accepted handler).
      const stream = await webrtc.prepareCall(peer._id, type === "video", (rs) => setRemoteStream(rs));
      setLocalStream(stream);
      socketRef.current?.emit("call_initiate", {
        calleeId: peer._id,
        callType: type,
        callerInfo: {},
      });
    } catch (err) {
      console.error("Call initiate error:", err);
      setCallState(null);
      setError("Could not start call. Check microphone/camera permissions.");
    }
  };

  const acceptCall = async () => {
    try {
      // Tell the caller we accepted → they will send the WebRTC offer.
      // The actual WebRTC answer + local stream setup happens in the
      // webrtc_offer socket listener when the caller's offer arrives.
      socketRef.current?.emit("call_accept", { callerId: callPeer._id });
      setCallState("connected");
      incomingOfferRef.current = null;
    } catch (err) {
      console.error("Accept call error:", err);
      setError("Could not accept call.");
      setCallState(null);
    }
  };

  const rejectCall = () => {
    socketRef.current?.emit("call_reject", { callerId: callPeer._id });
    setCallState(null);
    setCallPeer(null);
    incomingOfferRef.current = null;
  };

  const endCall = () => {
    if (callPeer) socketRef.current?.emit("call_end", { peerId: callPeer._id });
    webrtc.cleanup();
    setCallState(null);
    setCallPeer(null);
    setLocalStream(null);
    setRemoteStream(null);
  };

  // ── Group Call handlers ──
  const initiateGroupCall = async (group, type) => {
    setGroupCallGroupId(group._id);
    setGroupCallType(type);
    setGroupCallState("outgoing");
    try {
      const stream = await webrtc.getLocalStream(type === "video");
      groupCallLocalStreamRef.current = stream;
      setGroupCallLocalStream(stream);
      const memberIds = group.members.map((m) => (typeof m === "string" ? m : m._id));
      socketRef.current?.emit("group_call_initiate", { groupId: group._id, callType: type, memberIds });
      setGroupCallState("connected");
    } catch (err) {
      setGroupCallState(null);
      setError("Could not start group call.");
    }
  };

  const acceptGroupCall = async () => {
    try {
      const stream = await webrtc.getLocalStream(groupCallType === "video");
      groupCallLocalStreamRef.current = stream;
      setGroupCallLocalStream(stream);
      socketRef.current?.emit("group_call_join", { groupId: groupCallGroupId });
      setGroupCallState("connected");
    } catch (err) {
      setGroupCallState(null);
      setError("Could not join group call.");
    }
  };

  const rejectGroupCall = () => {
    setGroupCallState(null);
    setGroupCallGroupId(null);
  };

  const endGroupCall = () => {
    socketRef.current?.emit("group_call_leave", { groupId: groupCallGroupId });
    groupCallLocalStreamRef.current?.getTracks().forEach((t) => t.stop());
    Object.values(groupCallPcsRef.current).forEach((pc) => pc.close());
    groupCallPcsRef.current = {};
    setGroupCallState(null);
    setGroupCallGroupId(null);
    setGroupCallParticipants([]);
    setGroupCallLocalStream(null);
  };

  const openConversation = async (peer) => {
    if (lastPeerIdRef.current && socketRef.current) {
      socketRef.current.emit("leave_conversation", { userId: lastPeerIdRef.current });
    }
    setSelectedUser(peer);
    selectedUserRef.current = peer;
    setSelectedGroup(null);
    setShowGroupInfo(false);
    setTypingLabel("");
    setReplyingTo(null);
    setShowMsgSearch(false);
    setMsgSearch("");
    setShowContactInfo(false);
    setIsBusy((prev) => ({ ...prev, messages: true }));

    try {
      const { data } = await api.getConversation(peer._id, 1, 50);
      setMessages(data.messages || []);
      await api.markRead(peer._id);

      if (socketRef.current) {
        socketRef.current.emit("join_conversation", { userId: peer._id });
        socketRef.current.emit("mark_read", { senderId: peer._id });
        lastPeerIdRef.current = peer._id;
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load conversation.");
    } finally {
      setIsBusy((prev) => ({ ...prev, messages: false }));
    }
  };

  const onSendMessage = async (event) => {
    event.preventDefault();
    if (!selectedUser && !selectedGroup) return;

    const trimmed = draft.trim();
    if (!trimmed && !imageFile) return;

    // ── Group message via socket ──
    if (selectedGroup) {
      const tempId = `temp_${Date.now()}`;
      const optimisticMsg = {
        _id: tempId,
        senderId: { _id: user._id, username: user.username, profilePicture: user.profilePicture },
        groupId: selectedGroup._id,
        messageType: "text",
        messageContent: trimmed,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setDraft("");
      setReplyingTo(null);
      setShowEmoji(false);
      socketRef.current?.emit("send_group_message", {
        groupId: selectedGroup._id,
        messageType: "text",
        messageContent: trimmed,
        replyTo: replyingTo?._id || null,
      });
      return;
    }

    // ── DM message (existing logic) ──
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      senderId: { _id: user._id, username: user.username, profilePicture: user.profilePicture },
      receiverId: { _id: selectedUser._id, username: selectedUser.username },
      messageType: imageFile ? "image" : "text",
      messageContent: trimmed,
      imageUrl: imageFile ? URL.createObjectURL(imageFile) : undefined,
      createdAt: new Date().toISOString(),
      delivered: false,
      read: false,
      replyTo: replyingTo,
      _optimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");
    const sentImage = imageFile;
    setImageFile(null);
    setReplyingTo(null);
    setShowEmoji(false);

    const formData = new FormData();
    formData.append("receiverId", selectedUser._id);

    if (sentImage) {
      formData.append("messageType", "image");
      formData.append("messageImage", sentImage);
      if (trimmed) formData.append("messageContent", trimmed);
    } else {
      formData.append("messageType", "text");
      formData.append("messageContent", trimmed);
    }

    if (replyingTo) {
      formData.append("replyTo", replyingTo._id);
    }

    try {
      const { data } = await api.sendMessage(formData);
      setMessages((prev) => {
        const cleaned = prev.filter((m) => m._id !== tempId && m._id !== data._id);
        return [...cleaned, data];
      });
      refreshRecents();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      setError(err?.response?.data?.message || "Message could not be sent.");
    }
  };

  const onTyping = (value) => {
    setDraft(value);
    if (selectedGroup && socketRef.current) {
      socketRef.current.emit("group_typing", { groupId: selectedGroup._id, isTyping: true });
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        socketRef.current?.emit("group_typing", { groupId: selectedGroup._id, isTyping: false });
      }, 600);
      return;
    }
    if (!selectedUser || !socketRef.current) return;

    socketRef.current.emit("typing", { receiverId: selectedUser._id, isTyping: true });
    clearTimeout(typingTimerRef.current);

    typingTimerRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", {
        receiverId: selectedUser._id,
        isTyping: false,
      });
    }, 600);
  };

  const addFriend = async (username) => {
    try {
      await api.addFriend({ username });
      await loadFriendsAndRecents();
      setSearchQuery("");
      setSearchResults([]);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not add friend.");
    }
  };

  const updateProfile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsBusy((prev) => ({ ...prev, profile: true }));
    try {
      const formData = new FormData();
      formData.append("profilePicture", file);
      const { data } = await api.updateProfile(formData);
      updateCurrentUser(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update profile photo.");
    } finally {
      setIsBusy((prev) => ({ ...prev, profile: false }));
    }
  };

  const deleteMessage = async (msg, forEveryone = false) => {
    try {
      await api.deleteMessage(msg._id, forEveryone);
      if (forEveryone) {
        setMessages((prev) =>
          prev.map((m) =>
            m._id === msg._id ? { ...m, deletedForEveryone: true, messageContent: "", imageUrl: "" } : m
          )
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== msg._id));
      }
    } catch (err) {
      setError("Could not delete message.");
    }
    setContextMenu(null);
  };

  const toggleStarMessage = async (msg) => {
    try {
      const { data } = await api.toggleStar(msg._id);
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== msg._id) return m;
          const starredBy = m.starredBy || [];
          return {
            ...m,
            starredBy: data.starred
              ? [...starredBy, user._id]
              : starredBy.filter((id) => id !== user._id),
          };
        })
      );
    } catch {
      setError("Could not star message.");
    }
    setContextMenu(null);
  };

  const copyMessage = (msg) => {
    navigator.clipboard.writeText(msg.messageContent || "");
    setContextMenu(null);
  };

  const contacts = useMemo(() => {
    const merged = [...friends];
    recentConversations.forEach((item) => {
      if (!merged.find((friend) => friend._id === item.user._id)) {
        merged.push(item.user);
      }
    });
    return merged.sort(byNewest);
  }, [friends, recentConversations]);

  const getLastMessage = useCallback(
    (contactId) => {
      const conv = recentConversations.find((c) => c.user._id === contactId);
      if (!conv) return null;
      return conv.lastMessage;
    },
    [recentConversations]
  );

  const getUnreadCount = useCallback(
    (contactId) => {
      const conv = recentConversations.find((c) => c.user._id === contactId);
      return conv?.unreadCount || 0;
    },
    [recentConversations]
  );

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Error auto-dismiss
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(t);
  }, [error]);

  // Group messages by date for date separators
  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = "";
    messages.forEach((msg) => {
      const dateKey = dateSeparator(msg.timestamp || msg.createdAt);
      if (dateKey !== lastDate) {
        groups.push({ type: "date", label: dateKey, key: `date_${dateKey}_${msg._id}` });
        lastDate = dateKey;
      }
      groups.push({ type: "msg", data: msg, key: msg._id });
    });
    return groups;
  }, [messages]);

  const selectedPeer = peerMap.get(selectedUser?._id);

  // ── Profile picture helper ──
  const avatarUrl = (u, size = 40) =>
    u?.profilePicture
      ? `${SOCKET_BASE_URL}${u.profilePicture}`
      : `https://placehold.co/${size}x${size}/202c33/aebac1?text=${(u?.username?.[0] || "?").toUpperCase()}`;

  return (
    <div className="chat-shell">
      {/* ── Sidebar ──────────────────────────── */}
      <aside className={`sidebar ${showProfilePanel ? "sidebar-hidden" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-left">
            <label className="sidebar-avatar" title="Update profile photo" onClick={(e) => { e.preventDefault(); setShowProfilePanel(true); }}>
              <img src={avatarUrl(user)} alt="profile" />
            </label>
            <span className="sidebar-username">{user?.username}</span>
          </div>
          <div className="sidebar-header-actions">
            <button className="icon-btn" onClick={() => setShowCreateGroup(true)} type="button" title="New Group">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.5 13c-1.2 0-3.07.34-4.5 1-1.43-.67-3.3-1-4.5-1C5.33 13 1 14.08 1 16.25V19h22v-2.75C23 14.08 18.67 13 16.5 13zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm6 0c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5s-3.5 1.57-3.5 3.5S13.07 12 15 12z"/></svg>
            </button>
            <button className="icon-btn" onClick={logout} type="button" title="Logout">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 13v-2H7V8l-5 4 5 4v-3z"/><path d="M20 3h-9c-1.103 0-2 .897-2 2v4h2V5h9v14h-9v-4H9v4c0 1.103.897 2 2 2h9c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2z"/></svg>
            </button>
          </div>
        </div>

        <div className="search-bar">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍  Search or start new chat"
          />
        </div>

        {!!searchResults.length && (
          <ul className="search-results-dropdown">
            {searchResults.map((item) => (
              <li key={item._id}>
                <div className="search-result-user">
                  <img src={avatarUrl(item, 32)} alt="" className="search-result-avatar" />
                  <span>{item.username}</span>
                </div>
                <button onClick={() => addFriend(item.username)} type="button">
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="contact-list">
          {isBusy.friends && <p className="no-contacts">Syncing contacts…</p>}
          {!isBusy.friends && !contacts.length && (
            <p className="no-contacts">No chats yet. Search for a user above to start a conversation.</p>
          )}

          {contacts.map((contact) => {
            const lastMsg = getLastMessage(contact._id);
            const unread = getUnreadCount(contact._id);
            const lastMsgPreview = lastMsg
              ? lastMsg.deletedForEveryone
                ? "🚫 This message was deleted"
                : lastMsg.messageType === "image"
                ? "📷 Photo"
                : (lastMsg.messageContent || "").slice(0, 40)
              : "";

            return (
              <div
                key={contact._id}
                className={`contact-item ${selectedUser?._id === contact._id ? "active" : ""}`}
                onClick={() => openConversation(contact)}
              >
                <div className="contact-avatar">
                  <img src={avatarUrl(contact, 49)} alt={contact.username} />
                  {contact.online && <span className="online-badge" />}
                </div>
                <div className="contact-info">
                  <div className="contact-info-top">
                    <span className="contact-name">{contact.username}</span>
                    {lastMsg && (
                      <span className="contact-time">
                        {formatMsgTime(lastMsg.timestamp || lastMsg.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="contact-info-bottom">
                    <span className="contact-last-msg">
                      {lastMsgPreview || (contact.online ? "online" : formatLastSeen(contact.lastSeen))}
                    </span>
                    {unread > 0 && <span className="unread-badge">{unread}</span>}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Group Items ── */}
          {groups.length > 0 && (
            <div className="sidebar-section-label">GROUPS</div>
          )}
          {groups.map((group) => {
            const lastMsg = group.lastMessage;
            const lastMsgPreview = lastMsg
              ? (lastMsg.senderId?.username ? `${lastMsg.senderId.username}: ` : "") + (lastMsg.messageContent || "").slice(0, 30)
              : "";
            return (
              <div
                key={group._id}
                className={`contact-item ${selectedGroup?._id === group._id ? "active" : ""}`}
                onClick={() => openGroupConversation(group)}
              >
                <div className="contact-avatar">
                  <div className="group-avatar-icon">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="#aebac1"><path d="M16.5 13c-1.2 0-3.07.34-4.5 1-1.43-.67-3.3-1-4.5-1C5.33 13 1 14.08 1 16.25V19h22v-2.75C23 14.08 18.67 13 16.5 13zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm6 0c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5s-3.5 1.57-3.5 3.5S13.07 12 15 12z"/></svg>
                  </div>
                </div>
                <div className="contact-info">
                  <div className="contact-info-top">
                    <span className="contact-name">{group.name}</span>
                  </div>
                  <div className="contact-info-bottom">
                    <span className="contact-last-msg">{lastMsgPreview || `${group.members?.length || 0} participants`}</span>
                    {(group.unreadCount || 0) > 0 && <span className="unread-badge">{group.unreadCount}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Profile Panel (replaces sidebar) ── */}
      {showProfilePanel && (
        <aside className="sidebar profile-panel-sidebar">
          <div className="profile-panel-header">
            <button className="icon-btn" onClick={() => setShowProfilePanel(false)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
            <span>Profile</span>
          </div>
          <div className="profile-panel-body">
            <label className="profile-panel-avatar">
              <img src={avatarUrl(user, 200)} alt="profile" />
              <div className="profile-panel-avatar-overlay">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                <span>Change photo</span>
              </div>
              <input type="file" accept="image/*" onChange={updateProfile} hidden />
            </label>
            <div className="profile-panel-field">
              <label>Your name</label>
              <p>{user?.username}</p>
            </div>
            <div className="profile-panel-field">
              <label>About</label>
              <p>{user?.about || "Hey there! I am using WhatsApp"}</p>
            </div>
            <div className="profile-panel-field">
              <label>Email</label>
              <p>{user?.email}</p>
            </div>
          </div>
        </aside>
      )}

      {/* ── Conversation ─────────────────────── */}
      <main className="conversation">
        {!selectedUser && !selectedGroup && (
          <div className="empty-state">
            <div className="empty-state-icon-wrap">
              <svg viewBox="0 0 303 172" width="250" fill="none"><path d="M229.565 160.229c32.647-16.593 55.043-51.632 55.043-91.871 0-57.033-50.071-86.3-107.107-67.067C124.035-18.027 41.445-4.813 12.487 50.569-5.244 85.456 5.49 126.969 31.614 150.162" stroke="#00a884" strokeWidth="1.5" opacity=".35"/><circle cx="152" cy="86" r="65" stroke="#00a884" strokeWidth="1.5" opacity=".2"/><path d="M152 54c-17.673 0-32 14.327-32 32 0 6.016 1.66 11.64 4.547 16.453L121 118l16.12-4.227A31.824 31.824 0 00152 118c17.673 0 32-14.327 32-32s-14.327-32-32-32z" fill="#00a884" opacity=".15"/><path d="M152 54c-17.673 0-32 14.327-32 32 0 6.016 1.66 11.64 4.547 16.453L121 118l16.12-4.227A31.824 31.824 0 00152 118c17.673 0 32-14.327 32-32s-14.327-32-32-32z" stroke="#00a884" strokeWidth="1.5"/></svg>
            </div>
            <h2>WhatsApp Web</h2>
            <p>Send and receive messages without keeping your phone online.<br/>Use WhatsApp on up to 4 linked devices and 1 phone at the same time.</p>
            <div className="empty-state-encryption">
              <svg viewBox="0 0 10 12" width="10" height="12" fill="#8696a0"><path d="M5 0C3.346 0 2 1.346 2 3v1.5H1a1 1 0 00-1 1v5a1 1 0 001 1h8a1 1 0 001-1v-5a1 1 0 00-1-1H8V3c0-1.654-1.346-3-3-3zm0 1c1.103 0 2 .897 2 2v1.5H3V3c0-1.103.897-2 2-2z"/></svg>
              <span>End-to-end encrypted</span>
            </div>
          </div>
        )}

        {(selectedUser || selectedGroup) && (
          <>
            {selectedUser && (
            <header className="chat-header">
              <div className="chat-header-left" onClick={() => setShowContactInfo(!showContactInfo)}>
                <div className="chat-header-avatar">
                  <img src={avatarUrl(selectedUser)} alt={selectedUser.username} />
                </div>
                <div className="chat-header-info">
                  <h2>{selectedUser.username}</h2>
                  <p className={typingLabel ? "typing-text" : ""}>
                    {typingLabel ||
                      (selectedPeer?.online || peerMap.get(selectedUser._id)?.online
                        ? "online"
                        : formatLastSeen(selectedPeer?.lastSeen || peerMap.get(selectedUser._id)?.lastSeen))}
                  </p>
                </div>
              </div>
              <div className="chat-header-actions">
                <button className="icon-btn" onClick={() => initiateCall(selectedUser, 'audio')} title="Audio call">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                </button>
                <button className="icon-btn" onClick={() => initiateCall(selectedUser, 'video')} title="Video call">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                </button>
                <button className="icon-btn" onClick={() => { setShowMsgSearch(!showMsgSearch); setMsgSearch(""); }} title="Search">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 001.257-3.386 5.207 5.207 0 10-5.207 5.208 5.183 5.183 0 003.385-1.258l.22.22v.635l4.004 3.999 1.194-1.195-3.997-4.004zm-4.806 0a3.6 3.6 0 110-7.202 3.6 3.6 0 010 7.202z"/></svg>
                </button>
              </div>
            </header>
            )}

            {showMsgSearch && (
              <div className="msg-search-bar">
                <input
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="Search messages..."
                  autoFocus
                />
                <button className="icon-btn" onClick={() => { setShowMsgSearch(false); setMsgSearch(""); }}>✕</button>
                {msgSearchResults.length > 0 && (
                  <div className="msg-search-results">
                    {msgSearchResults.map((m) => (
                      <div key={m._id} className="msg-search-result-item" onClick={() => {
                        const el = document.getElementById(`msg-${m._id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        el?.classList.add("highlight-msg");
                        setTimeout(() => el?.classList.remove("highlight-msg"), 2000);
                        setShowMsgSearch(false);
                      }}>
                        <span className="msg-search-sender">{m.senderId?.username}</span>
                        <span className="msg-search-text">{m.messageContent?.slice(0, 60)}</span>
                        <span className="msg-search-time">{formatMsgTime(m.timestamp || m.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <section className="message-list">
              {isBusy.messages && (
                <div className="loading-messages">Loading messages…</div>
              )}
              {!isBusy.messages && !messages.length && (
                <div className="no-messages">
                  <span>No messages yet. Say hello 👋</span>
                </div>
              )}

              {groupedMessages.map((item) => {
                if (item.type === "date") {
                  return (
                    <div key={item.key} className="date-separator">
                      <span>{item.label}</span>
                    </div>
                  );
                }

                const message = item.data;
                const mine =
                  (typeof message.senderId === "string" ? message.senderId : message.senderId?._id) === user._id;

                if (message.deletedForEveryone) {
                  return (
                    <article key={message._id} id={`msg-${message._id}`} className={`bubble ${mine ? "mine" : "theirs"} deleted-bubble`}>
                      <p className="deleted-msg">🚫 This message was deleted</p>
                      <small>{formatMsgTime(message.timestamp || message.createdAt)}</small>
                    </article>
                  );
                }

                const text = message.messageContent || "";
                const image = message.messageType === "image" ? message.imageUrl : "";
                const imageSrc = message._optimistic ? image : image ? `${SOCKET_BASE_URL}${image}` : "";
                const isStarred = (message.starredBy || []).includes(user._id);

                return (
                  <article
                    key={message._id}
                    id={`msg-${message._id}`}
                    className={`bubble ${mine ? "mine" : "theirs"}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        msg: message,
                        mine,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                  >
                    {/* Reply reference */}
                    {message.replyTo && (
                      <div className="reply-ref" onClick={() => {
                        const el = document.getElementById(`msg-${message.replyTo._id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        el?.classList.add("highlight-msg");
                        setTimeout(() => el?.classList.remove("highlight-msg"), 2000);
                      }}>
                        <span className="reply-ref-sender">{message.replyTo.senderId?.username || "Unknown"}</span>
                        <span className="reply-ref-text">
                          {message.replyTo.messageType === "image" ? "📷 Photo" : (message.replyTo.messageContent || "").slice(0, 60)}
                        </span>
                      </div>
                    )}

                    {!!image && (
                      <img
                        src={imageSrc}
                        alt="attachment"
                        className="message-image"
                        onClick={() => setLightboxImg(imageSrc)}
                      />
                    )}
                    {!!text && <p>{text}</p>}
                    <small>
                      {isStarred && <span className="star-icon">⭐</span>}
                      {formatMsgTime(message.timestamp || message.createdAt)}
                      {mine && (
                        <span className={`msg-status ${message.read ? "read" : message.delivered ? "delivered" : "sent"}`}>
                          {message.read ? "✓✓" : message.delivered ? "✓✓" : "✓"}
                        </span>
                      )}
                    </small>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </section>

            {/* Reply bar */}
            {replyingTo && (
              <div className="reply-bar">
                <div className="reply-bar-content">
                  <span className="reply-bar-sender">
                    {(typeof replyingTo.senderId === "string" ? replyingTo.senderId : replyingTo.senderId?.username) || "You"}
                  </span>
                  <span className="reply-bar-text">
                    {replyingTo.messageType === "image" ? "📷 Photo" : (replyingTo.messageContent || "").slice(0, 80)}
                  </span>
                </div>
                <button className="reply-bar-close" onClick={() => setReplyingTo(null)}>✕</button>
              </div>
            )}

            {/* Image preview strip */}
            {imagePreview && (
              <div className="image-preview-strip">
                <img src={imagePreview} alt="preview" />
                <button className="image-preview-close" onClick={() => setImageFile(null)}>✕</button>
              </div>
            )}

            {/* Emoji picker */}
            {showEmoji && (
              <div className="emoji-panel">
                {EMOJIS.map((e, i) => (
                  <button key={i} className="emoji-btn" onClick={() => setDraft((prev) => prev + e)} type="button">
                    {e}
                  </button>
                ))}
              </div>
            )}

            <form className="composer" onSubmit={onSendMessage}>
              <button
                className="icon-btn composer-emoji-btn"
                type="button"
                title="Emoji"
                onClick={() => setShowEmoji(!showEmoji)}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm5.694 0c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zM11.984 2C6.486 2 2.017 6.48 2.017 11.979c0 5.498 4.469 9.978 9.967 9.978 5.497 0 9.966-4.48 9.966-9.978C21.95 6.48 17.481 2 11.984 2zm0 17.956c-4.398 0-7.967-3.57-7.967-7.978S7.586 4 11.984 4s7.966 3.57 7.966 7.978-3.569 7.978-7.966 7.978zm0-3.26c-2.146 0-4.142-1.246-5.053-3.18l1.789-.777c.57 1.214 1.847 2.048 3.264 2.048 1.418 0 2.696-.834 3.265-2.048l1.789.777c-.91 1.934-2.907 3.18-5.054 3.18z"/></svg>
              </button>
              <label className={`icon-btn composer-attach ${imageFile ? "has-file" : ""}`} title="Attach image">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647c1.501 0 2.912-.584 3.972-1.646l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 01-2.829 1.171 3.975 3.975 0 01-2.83-1.171 3.973 3.973 0 01-1.17-2.828c0-1.071.416-2.073 1.17-2.829l7.209-7.211c.191-.191.191-.567-.055-.812l-.243-.243c-.191-.191-.587-.349-.958.04L3.461 12.71c-1.062 1.062-1.645 2.472-1.645 3.974v-.128z"/></svg>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </label>
              <div className="composer-input-wrap">
                <input
                  value={draft}
                  onChange={(e) => onTyping(e.target.value)}
                  placeholder="Type a message"
                />
              </div>
              <button className="icon-btn composer-send" type="submit" title="Send">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"/></svg>
              </button>
            </form>
          </>
        )}
      </main>

      {/* ── Contact Info Panel ── */}
      {showContactInfo && selectedUser && (
        <aside className="contact-info-panel">
          <div className="contact-info-panel-header">
            <button className="icon-btn" onClick={() => setShowContactInfo(false)}>✕</button>
            <span>Contact info</span>
          </div>
          <div className="contact-info-panel-body">
            <div className="contact-info-avatar">
              <img src={avatarUrl(selectedUser, 200)} alt={selectedUser.username} />
            </div>
            <h3>{selectedUser.username}</h3>
            <p className="contact-info-status">
              {selectedPeer?.online || peerMap.get(selectedUser._id)?.online
                ? "online"
                : formatLastSeen(selectedPeer?.lastSeen || peerMap.get(selectedUser._id)?.lastSeen)}
            </p>
            <div className="contact-info-section">
              <label>About</label>
              <p>{selectedUser.about || peerMap.get(selectedUser._id)?.about || "Hey there! I am using WhatsApp"}</p>
            </div>
          </div>
        </aside>
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); }}>
            ↩ Reply
          </button>
          <button onClick={() => copyMessage(contextMenu.msg)}>
            📋 Copy
          </button>
          <button onClick={() => toggleStarMessage(contextMenu.msg)}>
            {(contextMenu.msg.starredBy || []).includes(user._id) ? "★ Unstar" : "☆ Star"}
          </button>
          {contextMenu.mine && (
            <button onClick={() => deleteMessage(contextMenu.msg, true)} className="context-danger">
              🗑 Delete for everyone
            </button>
          )}
          <button onClick={() => deleteMessage(contextMenu.msg, false)} className="context-danger">
            🗑 Delete for me
          </button>
        </div>
      )}

      {/* ── Image Lightbox ── */}
      {lightboxImg && (
        <div className="lightbox" onClick={() => setLightboxImg(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImg(null)}>✕</button>
          <img src={lightboxImg} alt="fullscreen" />
        </div>
      )}

      {error && <div className="toast">{error}</div>}

      {/* ── Group Conversation Header + Panel ── */}
      {selectedGroup && (
        <>
          <header className="chat-header" style={{ position: 'absolute', top: 0, left: 'var(--sidebar-width, 380px)', right: showGroupInfo ? '340px' : 0, zIndex: 5 }}>
            <div className="chat-header-left" onClick={() => setShowGroupInfo(!showGroupInfo)}>
              <div className="chat-header-avatar">
                <div className="group-avatar-icon" style={{ width: 40, height: 40 }}>
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="#aebac1"><path d="M16.5 13c-1.2 0-3.07.34-4.5 1-1.43-.67-3.3-1-4.5-1C5.33 13 1 14.08 1 16.25V19h22v-2.75C23 14.08 18.67 13 16.5 13zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm6 0c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5s-3.5 1.57-3.5 3.5S13.07 12 15 12z"/></svg>
                </div>
              </div>
              <div className="chat-header-info">
                <h2>{selectedGroup.name}</h2>
                <p className={typingLabel ? "typing-text" : ""}>
                  {typingLabel || `${selectedGroup.members?.length || 0} participants`}
                </p>
              </div>
            </div>
            <div className="chat-header-actions">
              <button className="icon-btn" onClick={() => initiateGroupCall(selectedGroup, 'audio')} title="Audio call">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
              </button>
              <button className="icon-btn" onClick={() => initiateGroupCall(selectedGroup, 'video')} title="Video call">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
              </button>
            </div>
          </header>
        </>
      )}

      {/* ── Group Info Panel ── */}
      {showGroupInfo && selectedGroup && (
        <GroupInfoPanel
          group={selectedGroup}
          currentUserId={user._id}
          onClose={() => setShowGroupInfo(false)}
          onRemoveMember={onRemoveGroupMember}
          onLeaveGroup={onLeaveGroup}
          socketBaseUrl={SOCKET_BASE_URL}
        />
      )}

      {/* ── 1:1 Call Overlay ── */}
      <CallOverlay
        callState={callState}
        callType={callType}
        peerName={callPeer?.username}
        peerPicture={callPeer?.profilePicture}
        localStream={localStream}
        remoteStream={remoteStream}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleMute={() => webrtc.toggleMute()}
        onToggleVideo={() => webrtc.toggleVideo()}
        socketBaseUrl={SOCKET_BASE_URL}
      />

      {/* ── Group Call Overlay ── */}
      <GroupCallOverlay
        callState={groupCallState}
        callType={groupCallType}
        groupName={groups.find((g) => g._id === groupCallGroupId)?.name || "Group"}
        callerName={callPeer?.username}
        participants={groupCallParticipants}
        localStream={groupCallLocalStream}
        onAccept={acceptGroupCall}
        onReject={rejectGroupCall}
        onEnd={endGroupCall}
        onToggleMute={() => webrtc.toggleMute()}
        onToggleVideo={() => webrtc.toggleVideo()}
        socketBaseUrl={SOCKET_BASE_URL}
      />

      {/* ── Create Group Dialog ── */}
      {showCreateGroup && (
        <CreateGroupDialog
          friends={friends}
          onClose={() => setShowCreateGroup(false)}
          onCreate={onCreateGroup}
        />
      )}
    </div>
  );
}
