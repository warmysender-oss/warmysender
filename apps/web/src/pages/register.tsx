import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { AuthScreen } from "@/pages/auth-screen";

export function RegisterPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  useEffect(() => {
    void api<{ hasUsers: boolean }>("/api/auth/setup")
      .then((data) => setHasUsers(data.hasUsers))
      .catch(() => setHasUsers(true));
  }, []);

  useEffect(() => {
    if (!token) return;
    void api<{ email: string | null }>("/api/invites/preview", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((data) => {
        if (data.email) {
          setInvitedEmail(data.email);
          setEmail(data.email);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "This invite link does not work.");
      });
  }, [token]);

  const firstAccount = hasUsers === false && !token;

  async function onSubmit() {
    setPending(true);
    setError(null);
    try {
      const data = await api<{ user: User }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, inviteToken: token }),
      });
      setUser(data.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account.");
    } finally {
      setPending(false);
    }
  }

  if (hasUsers === null) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }

  if (hasUsers && !token) {
    return (
      <AuthScreen
        title="Invite required"
        subtitle="This install already has an admin."
        footer={
          <Link className="text-primary" to="/login">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm">Ask an admin for an invite link. The link opens this page with a token.</p>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={firstAccount ? "Create the admin account" : "Accept invite"}
      subtitle={
        firstAccount
          ? "The first person to sign up becomes the admin."
          : invitedEmail
            ? `This invite is for ${invitedEmail}.`
            : "Set a password to join this install."
      }
      error={error}
      footer={
        <Link className="text-primary" to="/login">
          Already have an account? Sign in
        </Link>
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
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={Boolean(invitedEmail)}
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button className="w-full" type="submit" disabled={pending}>
          {pending ? "Creating…" : firstAccount ? "Create admin account" : "Join"}
        </Button>
      </form>
    </AuthScreen>
  );
}
