import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { WarmySenderSection } from "@/pages/settings/WarmySenderSection";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
};

type InviteRow = {
  id: string;
  email: string | null;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  url?: string;
  token?: string;
};

export function SettingsPage() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keyName, setKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [freshInvite, setFreshInvite] = useState<InviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadKeys() {
    const data = await api<{ apiKeys: ApiKeyRow[] }>("/api/api-keys");
    setKeys(data.apiKeys);
  }

  async function loadInvites() {
    if (user?.role !== "admin") return;
    const data = await api<{ invites: InviteRow[] }>("/api/invites");
    setInvites(data.invites);
  }

  useEffect(() => {
    void loadKeys().catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load keys."));
    void loadInvites().catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load invites."));
  }, [user?.role]);

  async function createKey() {
    setError(null);
    try {
      const created = await api<ApiKeyRow & { key: string }>("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: keyName }),
      });
      setFreshKey(created.key);
      setKeyName("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the key.");
    }
  }

  async function revokeKey(id: string) {
    setError(null);
    await api(`/api/api-keys/${id}`, { method: "DELETE" });
    await loadKeys();
  }

  async function createInvite() {
    setError(null);
    try {
      const created = await api<InviteRow>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail || undefined, role: inviteRole }),
      });
      setFreshInvite(created);
      setInviteEmail("");
      await loadInvites();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the invite.");
    }
  }

  async function deleteInvite(id: string) {
    await api(`/api/invites/${id}`, { method: "DELETE" });
    await loadInvites();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as {user?.email} ({user?.role}).
        </p>
      </div>
      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">API keys</h2>
        <p className="text-sm text-muted-foreground">
          A key is shown once. The server stores a hash. Agents use it later for the API and MCP. Keys cannot send mail or raise a limit.
        </p>
        <Card className="space-y-4 p-4">
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void createKey();
            }}
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input id="key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Claude" required />
            </div>
            <Button className="sm:self-end" type="submit">
              Create key
            </Button>
          </form>
          {freshKey ? (
            <div className="space-y-2 rounded-md bg-primary/10 p-3">
              <p className="text-sm font-medium">Copy this key now. It will not be shown again.</p>
              <Input readOnly value={freshKey} aria-label="New API key" onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : null}
          {keys.length === 0 ? <p className="text-sm text-muted-foreground">No API keys yet.</p> : null}
          <ul className="space-y-2">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{key.name}</span>
                  <span className="ml-2 font-mono text-muted-foreground">{key.prefix}…</span>
                  {key.revokedAt ? <span className="ml-2 text-danger">Revoked</span> : null}
                </span>
                {key.revokedAt ? null : (
                  <Button variant="outline" size="sm" onClick={() => void revokeKey(key.id)}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {user?.role === "admin" ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Invites</h2>
          <p className="text-sm text-muted-foreground">Invite links last 7 days. No email is sent; share the link yourself.</p>
          <Card className="space-y-4 p-4">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_140px_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                void createInvite();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email (optional)</Label>
                <Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@harbor-dental.test" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  className="flex h-10 w-full rounded-md border bg-card px-3 text-sm"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button className="sm:self-end" type="submit">
                Create invite
              </Button>
            </form>
            {freshInvite?.url ? (
              <div className="space-y-2 rounded-md bg-primary/10 p-3">
                <p className="text-sm font-medium">Share this link. The token is stored as a hash.</p>
                <Input readOnly value={freshInvite.url} aria-label="Invite link" onFocus={(event) => event.currentTarget.select()} />
              </div>
            ) : null}
            <ul className="space-y-2">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                  <span>
                    {invite.email ?? "Any email"} · {invite.role}
                    {invite.acceptedAt ? " · accepted" : ` · expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                  </span>
                  {invite.acceptedAt ? null : (
                    <Button variant="outline" size="sm" onClick={() => void deleteInvite(invite.id)}>
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <WarmySenderSection />
    </div>
  );
}
