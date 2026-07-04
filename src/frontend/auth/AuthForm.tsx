import { useState } from "react";
import type { AuthFormProps } from "@/frontend/types";
import { register, login, setAuth } from "@/frontend/api";

export default function AuthForm({ onAuthenticated }: AuthFormProps) {
  const [currentTab, setCurrentTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data =
        currentTab === "login"
          ? await login(username, password)
          : await register(username, password);

      setAuth((data as { token: string }).token, (data as { username: string }).username);
      onAuthenticated((data as { username: string }).username);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>pi-server</h1>
        <p className="subtitle">AI Coding Agent</p>
        <div className="auth-tabs">
          <button
            className={`auth-tab ${currentTab === "login" ? "active" : ""}`}
            onClick={() => setCurrentTab("login")}
          >
            Login
          </button>
          <button
            className={`auth-tab ${currentTab === "register" ? "active" : ""}`}
            onClick={() => setCurrentTab("register")}
          >
            Register
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="auth-username">Username</label>
            <input
              type="text"
              id="auth-username"
              placeholder="Enter username"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <input
              type="password"
              id="auth-password"
              placeholder="Enter password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Please wait..." : currentTab === "login" ? "Login" : "Register"}
          </button>
          {error && <p className="auth-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
