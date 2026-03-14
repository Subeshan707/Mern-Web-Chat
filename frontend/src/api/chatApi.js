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
};
