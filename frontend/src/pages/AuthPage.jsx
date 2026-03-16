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
      <div className={`auth-card auth-split reveal-up ${mode === "register" ? "active" : ""}`}>
        <div className="auth-ambient-main" />
        <div className="auth-ambient-alt" />

        <section className="auth-panel auth-panel-form">
          <p className="eyebrow">Realtime Messaging</p>
          <h1>{mode === "login" ? "Welcome Back" : "Join PulseChat"}</h1>
          <p className="muted">
            {mode === "login"
              ? "Sign in to continue your conversations in real time."
              : "Create an account and start secure chats with your friends."}
          </p>

          <form onSubmit={onSubmit} className="auth-form">
            {mode === "register" && (
              <div className="field">
                <input
                  id="username"
                  name="username"
                  value={form.username}
                  onChange={onChange}
                  required
                  minLength={3}
                  placeholder=" "
                />
                <label htmlFor="username">Username</label>
              </div>
            )}

            <div className="field">
              <input
                id="email"
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                required
                placeholder=" "
              />
              <label htmlFor="email">Email</label>
            </div>

            <div className="field">
              <input
                id="password"
                type="password"
                name="password"
                value={form.password}
                onChange={onChange}
                required
                minLength={6}
                placeholder=" "
              />
              <label htmlFor="password">Password</label>
            </div>

            {mode === "register" && (
              <label className="file-pill auth-upload-pill">
                {form.profilePicture?.name ? form.profilePicture.name.slice(0, 22) : "Upload profile image"}
                <input type="file" name="profilePicture" accept="image/*" onChange={onChange} hidden />
              </label>
            )}

            {error && <p className="error-text">{error}</p>}

            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>
        </section>

        <section className="auth-panel auth-panel-info">
          <p className="eyebrow">{mode === "login" ? "No account yet?" : "Already a member?"}</p>
          <h2>{mode === "login" ? "Create One In Seconds" : "Welcome Back Again"}</h2>
          <p>
            {mode === "login"
              ? "Switch to sign up, set your profile, and start chatting instantly."
              : "Switch to login and continue right where your conversations left off."}
          </p>

          <button
            className="btn-ghost auth-switch"
            onClick={() => {
              setError("");
              setMode((prev) => (prev === "login" ? "register" : "login"));
            }}
            type="button"
          >
            {mode === "login" ? "Switch To Register" : "Switch To Login"}
          </button>
        </section>
      </div>
    </div>
  );
}
