import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "@/lib/api";

export function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAuth(mode: "login" | "register") {
    if (!email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim());
      } else {
        await register(email.trim());
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-800">Bonsai 3D</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in or create an account
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAuth("login");
              }}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => handleAuth("login")}
              disabled={loading || !email.trim()}
              className="flex-1 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "..." : "Log In"}
            </button>
            <button
              onClick={() => handleAuth("register")}
              disabled={loading || !email.trim()}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "..." : "Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
