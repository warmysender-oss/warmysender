import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { DashboardPage } from "@/pages/dashboard";
import { MailboxesRoute } from "@/pages/mailboxes/MailboxesRoute";
import { LoginPage } from "@/pages/login";
import { PlaceholderPage } from "@/pages/placeholder";
import { RegisterPage } from "@/pages/register";
import { SettingsPage } from "@/pages/settings";

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invite/:token" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/mailboxes" element={<MailboxesRoute />} />
        <Route path="/contacts" element={<PlaceholderPage title="Contacts" body="CSV import, lists, and the suppression list land in a later milestone." />} />
        <Route path="/campaigns" element={<PlaceholderPage title="Campaigns" body="Sequence steps, preview, and the launch check are not built yet." />} />
        <Route path="/inbox" element={<PlaceholderPage title="Inbox" body="Replies, auto-replies, and bounces will show up here after the inbox milestone." />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
