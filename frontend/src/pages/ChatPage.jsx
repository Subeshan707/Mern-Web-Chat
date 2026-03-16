import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../api/chatApi";
import { useAuth } from "../context/AuthContext";

const SOCKET_BASE_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

function byNewest(a, b) {
  return new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0);
}

export default function ChatPage() {
  const { user, token, logout, updateCurrentUser } = useAuth();
  const socketRef = useRef(null);
  const lastPeerIdRef = useRef(null);
  const typingTimerRef = useRef(null);
  const selectedUserRef = useRef(null);

  const [friends, setFriends] = useState([]);
  const [recentConversations, setRecentConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [draft, setDraft] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [typingLabel, setTypingLabel] = useState("");
  const [isBusy, setIsBusy] = useState({ friends: false, messages: false, send: false, profile: false });
  const [error, setError] = useState("");

  const peerMap = useMemo(() => {
    const fromFriends = friends.map((f) => [f._id, f]);
    const fromRecent = recentConversations.map((c) => [c.user._id, c.user]);
    return new Map([...fromFriends, ...fromRecent]);
  }, [friends, recentConversations]);

  useEffect(() => {
    loadFriendsAndRecents();
  }, []);

  // Only bind socket listeners once per token
  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_BASE_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on("connect_error", (err) => {
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
      if (selectedUser?._id === userId) {
        setTypingLabel(isTyping ? `${username} is typing...` : "");
      }
    });

    return () => {
      // Leave any joined room on disconnect
      if (lastPeerIdRef.current && socketRef.current) {
        socketRef.current.emit("leave_conversation", { userId: lastPeerIdRef.current });
      }
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line
  }, [token]);

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

  const openConversation = async (peer) => {
    // Leave previous room if any
    if (lastPeerIdRef.current && socketRef.current) {
      socketRef.current.emit("leave_conversation", { userId: lastPeerIdRef.current });
    }
    setSelectedUser(peer);
    selectedUserRef.current = peer;
    setTypingLabel("");
    setIsBusy((prev) => ({ ...prev, messages: true }));

    try {
      const { data } = await api.getConversation(peer._id, 1, 50);
      setMessages(data.messages || []);
      await api.markRead(peer._id);

      if (socketRef.current) {
        socketRef.current.emit("join_conversation", { userId: peer._id });
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
    if (!selectedUser) return;

    const trimmed = draft.trim();
    if (!trimmed && !imageFile) return;

    // Create optimistic message for instant display
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      senderId: { _id: user._id, username: user.username, profilePicture: user.profilePicture },
      receiverId: { _id: selectedUser._id, username: selectedUser.username },
      messageType: imageFile ? "image" : "text",
      messageContent: trimmed,
      imageUrl: imageFile ? URL.createObjectURL(imageFile) : undefined,
      createdAt: new Date().toISOString(),
      _optimistic: true,
    };

    // Show message instantly & clear input
    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");
    const sentImage = imageFile;
    setImageFile(null);

    // Build form data and send in background
    const formData = new FormData();
    formData.append("receiverId", selectedUser._id);

    if (sentImage) {
      formData.append("messageType", "image");
      formData.append("messageImage", sentImage);
    } else {
      formData.append("messageType", "text");
      formData.append("messageContent", trimmed);
    }

    try {
      const { data } = await api.sendMessage(formData);
      // Remove the temp message and any socket-delivered duplicate, then add the confirmed one
      setMessages((prev) => {
        const cleaned = prev.filter((m) => m._id !== tempId && m._id !== data._id);
        return [...cleaned, data];
      });
      refreshRecents();
    } catch (err) {
      // Remove the optimistic message on failure
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      setError(err?.response?.data?.message || "Message could not be sent.");
    }
  };

  const onTyping = (value) => {
    setDraft(value);
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

  const contacts = useMemo(() => {
    const merged = [...friends];
    recentConversations.forEach((item) => {
      if (!merged.find((friend) => friend._id === item.user._id)) {
        merged.push(item.user);
      }
    });
    return merged.sort(byNewest);
  }, [friends, recentConversations]);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-shell">
      {/* ── Sidebar ──────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-left">
            <label className="sidebar-avatar" title="Update profile photo">
              <img
                src={user?.profilePicture ? `${SOCKET_BASE_URL}${user.profilePicture}` : "https://placehold.co/40x40/202c33/aebac1?text=" + (user?.username?.[0]?.toUpperCase() || "U")}
                alt="profile"
              />
              <input type="file" accept="image/*" onChange={updateProfile} hidden />
            </label>
            <span className="sidebar-username">{user?.username}</span>
          </div>
          <div className="sidebar-header-actions">
            <button className="icon-btn" onClick={logout} type="button" title="Logout">
              ⏻
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
                <span>{item.username}</span>
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

          {contacts.map((contact) => (
            <div
              key={contact._id}
              className={`contact-item ${selectedUser?._id === contact._id ? "active" : ""}`}
              onClick={() => openConversation(contact)}
            >
              <div className="contact-avatar">
                <img
                  src={contact.profilePicture ? `${SOCKET_BASE_URL}${contact.profilePicture}` : "https://placehold.co/49x49/202c33/aebac1?text=" + (contact.username?.[0]?.toUpperCase() || "?")}
                  alt={contact.username}
                />
                {contact.online && <span className="online-badge" />}
              </div>
              <div className="contact-info">
                <span className="contact-name">{contact.username}</span>
                <span className="contact-last-seen">
                  {contact.online ? "online" : "last seen recently"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Conversation ─────────────────────── */}
      <main className="conversation">
        {!selectedUser && (
          <div className="empty-state">
            <h2>WhatsApp Web</h2>
            <p>Send and receive messages. Now with real-time delivery powered by Socket.IO.</p>
          </div>
        )}

        {selectedUser && (
          <>
            <header className="chat-header">
              <div className="chat-header-avatar">
                <img
                  src={selectedUser.profilePicture ? `${SOCKET_BASE_URL}${selectedUser.profilePicture}` : "https://placehold.co/40x40/202c33/aebac1?text=" + (selectedUser.username?.[0]?.toUpperCase() || "?")}
                  alt={selectedUser.username}
                />
              </div>
              <div className="chat-header-info">
                <h2>{selectedUser.username}</h2>
                <p className={typingLabel ? "typing-text" : ""}>
                  {typingLabel || (peerMap.get(selectedUser._id)?.online ? "online" : "offline")}
                </p>
              </div>
            </header>

            <section className="message-list">
              {isBusy.messages && (
                <div className="loading-messages">Loading messages…</div>
              )}
              {!isBusy.messages && !messages.length && (
                <div className="no-messages">
                  <span>No messages yet. Say hello 👋</span>
                </div>
              )}

              {messages.map((message) => {
                const mine =
                  (typeof message.senderId === "string" ? message.senderId : message.senderId?._id) === user._id;

                const text = message.messageType === "text" ? message.messageContent : "";
                const image = message.messageType === "image" ? message.imageUrl : "";
                const imageSrc = message._optimistic ? image : `${SOCKET_BASE_URL}${image}`;

                return (
                  <article key={message._id} className={`bubble ${mine ? "mine" : "theirs"}`}>
                    {!!text && <p>{text}</p>}
                    {!!image && (
                      <img src={imageSrc} alt="attachment" className="message-image" />
                    )}
                    <small>{new Date(message.timestamp || message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </section>

            <form className="composer" onSubmit={onSendMessage}>
              <label className={`composer-attach ${imageFile ? "has-file" : ""}`} title="Attach image">
                📎
                <input
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
              <button className="composer-send" type="submit" title="Send">
                ➤
              </button>
            </form>
          </>
        )}
      </main>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
