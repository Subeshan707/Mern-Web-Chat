import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/chatApi";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("chat_token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("chat_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setIsBootstrapping(false);
      return;
    }

    api
      .getMe()
      .then((res) => {
        setUser(res.data);
        localStorage.setItem("chat_user", JSON.stringify(res.data));
      })
      .catch(() => {
        setToken("");
        setUser(null);
        localStorage.removeItem("chat_token");
        localStorage.removeItem("chat_user");
      })
      .finally(() => setIsBootstrapping(false));
  }, [token]);

  const login = async (email, password) => {
    const { data } = await api.login({ email, password });
    setToken(data.token);
    setUser(data);
    localStorage.setItem("chat_token", data.token);
    localStorage.setItem("chat_user", JSON.stringify(data));
    return data;
  };

  const register = async (formData) => {
    const { data } = await api.register(formData);
    setToken(data.token);
    setUser(data);
    localStorage.setItem("chat_token", data.token);
    localStorage.setItem("chat_user", JSON.stringify(data));
    return data;
  };

  const logout = () => {
    setToken("");
    setUser(null);
    localStorage.removeItem("chat_token");
    localStorage.removeItem("chat_user");
  };

  const updateCurrentUser = (nextUser) => {
    setUser(nextUser);
    localStorage.setItem("chat_user", JSON.stringify(nextUser));
  };

  const value = useMemo(
    () => ({
      token,
      user,
      isBootstrapping,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      updateCurrentUser,
    }),
    [token, user, isBootstrapping]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
