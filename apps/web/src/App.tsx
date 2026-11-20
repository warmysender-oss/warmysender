import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/shell";
import { useAuth } from "@/lib/auth";
import { CampaignsRoute } from "@/pages/campaigns/CampaignsRoute";
import { ContactsRoute } from "@/pages/contacts/ContactsRoute";
import { DashboardPage } from "@/pages/dashboard";
import { MailboxesRoute } from "@/pages/mailboxes/MailboxesRoute";
import { LoginPage } from "@/pages/login";
import { InboxPage } from "@/pages/inbox/page";
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
        <Route path="/contacts" element={<ContactsRoute />} />
        <Route path="/campaigns" element={<CampaignsRoute />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
