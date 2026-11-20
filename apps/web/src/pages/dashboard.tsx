import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export function DashboardPage() {
  const { user } = useAuth();
  const greeting = user?.name ? user.name : user?.email;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">Welcome{greeting ? `, ${greeting}` : ""}.</p>
      <Card className="mt-6 p-6">
        <p className="text-sm">
          Accounts are ready. Mailboxes, contacts, campaigns, and the inbox arrive in the next milestones.
          Sending stays inside safe limits: a daily cap, a window, a gap, and a ramp for new mailboxes.
        </p>
      </Card>
    </div>
  );
}
