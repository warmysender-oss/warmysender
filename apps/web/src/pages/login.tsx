import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { AuthScreen } from "@/pages/auth-screen";

export function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);

  useEffect(() => {
    void api<{ hasUsers: boolean }>("/api/auth/setup")
      .then((data) => setHasUsers(data.hasUsers))
      .catch(() => setHasUsers(true));
  }, []);

  async function onSubmit() {
    setPending(true);
    setError(null);
    try {
      const data = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      title="Sign in"
      subtitle="Use the email and password for this install."
      error={error}
      footer={
        hasUsers ? (
          <span>Need access? Ask an admin for an invite link.</span>
        ) : (
          <Link className="text-primary" to="/register">
            Create the admin account
          </Link>
        )
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthScreen>
  );
}
