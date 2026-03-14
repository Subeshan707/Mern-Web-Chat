import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthPage() {
  const { isAuthenticated, login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    profilePicture: null,
  });

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onChange = (event) => {
    const { name, value, files } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: files ? files[0] : value,
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        const payload = new FormData();
        payload.append("username", form.username);
        payload.append("email", form.email);
        payload.append("password", form.password);
        if (form.profilePicture) {
          payload.append("profilePicture", form.profilePicture);
        }
        await register(payload);
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card reveal-up">
        <p className="eyebrow">Realtime Messaging</p>
        <h1>{mode === "login" ? "Welcome Back" : "Create Account"}</h1>
        <p className="muted">Connect instantly with your friends and send messages securely.</p>

        <form onSubmit={onSubmit} className="auth-form">
          {mode === "register" && (
            <label>
              Username
              <input
                name="username"
                value={form.username}
                onChange={onChange}
                required
                minLength={3}
                placeholder="john_doe"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              required
              placeholder="john@example.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              required
              minLength={6}
              placeholder="••••••••"
            />
          </label>

          {mode === "register" && (
            <label>
              Profile picture (optional)
              <input type="file" name="profilePicture" accept="image/*" onChange={onChange} />
            </label>
          )}

          {error && <p className="error-text">{error}</p>}

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <button
          className="btn-ghost"
          onClick={() => {
            setError("");
            setMode((prev) => (prev === "login" ? "register" : "login"));
          }}
          type="button"
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
}
