"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  async function go(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const d = await r.json();

      if (!r.ok) {
        setError(d.error || "Kunne ikke logge inn.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Kunne ikke logge inn.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <form className="loginbox" onSubmit={go}>
        <div className="mark">AS</div>

        <h1>Back office</h1>
        <p className="muted">Aadland Service</p>

        <div className="field">
          <label>E-post</label>
          <input
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Passord</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="notice">{error}</p>}

        <button
          className="btn"
          style={{ width: "100%", marginTop: 14 }}
          disabled={loading}
        >
          {loading ? "Logger inn..." : "Logg inn"}
        </button>
      </form>
    </main>
  );
}
