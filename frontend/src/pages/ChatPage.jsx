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
  const typingTimerRef = useRef(null);

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

      if (selectedUser?._id === peerId) {
        setMessages((prev) => [...prev, message]);
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, selectedUser?._id]);

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
    setSelectedUser(peer);
    setTypingLabel("");
    setIsBusy((prev) => ({ ...prev, messages: true }));

    try {
      const { data } = await api.getConversation(peer._id, 1, 50);
      setMessages(data.messages || []);
      await api.markRead(peer._id);

      if (socketRef.current) {
        socketRef.current.emit("join_conversation", { userId: peer._id });
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load conversation.");
    } finally {
      setIsBusy((prev) => ({ ...prev, messages: false }));
    }
  };

  const onSendMessage = async (event) => {
    event.preventDefault();
    if (!selectedUser || isBusy.send) return;

    const trimmed = draft.trim();
    if (!trimmed && !imageFile) return;

    setIsBusy((prev) => ({ ...prev, send: true }));

    try {
      const formData = new FormData();
      formData.append("receiverId", selectedUser._id);

      if (imageFile) {
        formData.append("messageType", "image");
        formData.append("messageImage", imageFile);
      } else {
        formData.append("messageType", "text");
        formData.append("messageContent", trimmed);
      }

      const { data } = await api.sendMessage(formData);
      setMessages((prev) => [...prev, data]);
      setDraft("");
      setImageFile(null);
      await refreshRecents();
    } catch (err) {
      setError(err?.response?.data?.message || "Message could not be sent.");
    } finally {
      setIsBusy((prev) => ({ ...prev, send: false }));
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

  return (
    <div className="chat-shell">
      <aside className="sidebar reveal-up">
        <header className="profile-block">
          <div className="avatar-wrap">
            <img
              src={user?.profilePicture ? `${SOCKET_BASE_URL}${user.profilePicture}` : "https://placehold.co/72x72?text=You"}
              alt="profile"
            />
          </div>
          <div>
            <p className="eyebrow">Signed in as</p>
            <h2>{user?.username}</h2>
          </div>
        </header>

        <div className="sidebar-actions">
          <label className="file-pill">
            {isBusy.profile ? "Uploading..." : "Update photo"}
            <input type="file" accept="image/*" onChange={updateProfile} hidden />
          </label>
          <button className="btn-ghost" onClick={logout} type="button">
            Logout
          </button>
        </div>

        <section className="search-panel">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users by username"
          />
          {!!searchResults.length && (
            <ul className="result-list">
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
        </section>

        <section className="contacts">
          <h3>Contacts</h3>
          {isBusy.friends && <p className="muted">Syncing contacts...</p>}
          {!isBusy.friends && !contacts.length && <p className="muted">No contacts yet. Add someone above.</p>}
          <ul>
            {contacts.map((contact) => (
              <li
                key={contact._id}
                className={selectedUser?._id === contact._id ? "active" : ""}
                onClick={() => openConversation(contact)}
              >
                <span className={`status-dot ${contact.online ? "online" : "offline"}`} />
                <div>
                  <p>{contact.username}</p>
                  <small>{contact.online ? "online" : "last seen recently"}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="conversation reveal-up-delay">
        {!selectedUser && (
          <div className="screen-center">
            <h2>Choose a contact to start chatting</h2>
            <p className="muted">Messages, images, and read states are connected to your live backend.</p>
          </div>
        )}

        {selectedUser && (
          <>
            <header className="chat-header">
              <div>
                <h2>{selectedUser.username}</h2>
                <p className="muted">{typingLabel || (peerMap.get(selectedUser._id)?.online ? "Online" : "Offline")}</p>
              </div>
            </header>

            <section className="message-list">
              {isBusy.messages && <p className="muted">Loading conversation...</p>}
              {!isBusy.messages && !messages.length && <p className="muted">No messages yet. Say hello.</p>}

              {messages.map((message) => {
                const mine =
                  (typeof message.senderId === "string" ? message.senderId : message.senderId?._id) === user._id;

                const text = message.messageType === "text" ? message.messageContent : "";
                const image = message.messageType === "image" ? message.imageUrl : "";

                return (
                  <article key={message._id} className={`bubble ${mine ? "mine" : "theirs"}`}>
                    {!!text && <p>{text}</p>}
                    {!!image && (
                      <img
                        src={`${SOCKET_BASE_URL}${image}`}
                        alt="message attachment"
                        className="message-image"
                      />
                    )}
                    <small>{new Date(message.timestamp || message.createdAt).toLocaleTimeString()}</small>
                  </article>
                );
              })}
            </section>

            <form className="composer" onSubmit={onSendMessage}>
              <input
                value={draft}
                onChange={(e) => onTyping(e.target.value)}
                placeholder="Write a message"
              />
              <label className="file-pill compact">
                {imageFile ? imageFile.name.slice(0, 12) : "Image"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                />
              </label>
              <button className="btn-primary" type="submit" disabled={isBusy.send}>
                {isBusy.send ? "Sending..." : "Send"}
              </button>
            </form>
          </>
        )}
      </main>

      {error && <div className="toast">{error}</div>}
    </div>
  );
}
