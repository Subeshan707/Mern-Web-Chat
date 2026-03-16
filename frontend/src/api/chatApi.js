import http from "./http";

export const api = {
  register: (formData) =>
    http.post("/auth/register", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  login: (payload) => http.post("/auth/login", payload),
  getMe: () => http.get("/auth/me"),

  searchUsers: (query) => http.get(`/users/search?query=${encodeURIComponent(query)}`),
  getUserById: (userId) => http.get(`/users/${userId}`),
  updateProfile: (formData) =>
    http.put("/users/profile", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  updateAbout: (about) => http.put("/users/profile", { about }),

  addFriend: (payload) => http.post("/friends/add", payload),
  getFriends: () => http.get("/friends"),
  checkFriendStatus: (userId) => http.get(`/friends/status/${userId}`),
  removeFriend: (friendId) => http.delete(`/friends/${friendId}`),

  getRecentConversations: () => http.get("/messages/recent"),
  getConversation: (userId, page = 1, limit = 50) =>
    http.get(`/messages/${userId}?page=${page}&limit=${limit}`),
  sendMessage: (formData) =>
    http.post("/messages", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  markRead: (userId) => http.put(`/messages/read/${userId}`),
  deleteMessage: (messageId, forEveryone = false) =>
    http.delete(`/messages/${messageId}`, { data: { forEveryone } }),
  toggleStar: (messageId) => http.put(`/messages/star/${messageId}`),
  searchMessages: (userId, query) =>
    http.get(`/messages/search/${userId}?q=${encodeURIComponent(query)}`),
};
