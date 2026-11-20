import {
  LayoutDashboard,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  Settings,
  Users,
  X,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useState } from "react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/mailboxes", label: "Mailboxes", icon: Mail, end: false },
  { to: "/contacts", label: "Contacts", icon: Users, end: false },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, end: false },
  { to: "/inbox", label: "Inbox", icon: MessageSquare, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export function Shell() {
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Mail className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold leading-none">WarmySender</p>
          <p className="mt-1 text-xs text-muted-foreground">Open source</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                isActive ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r bg-sidebar md:sticky md:top-0 md:block md:h-screen md:overflow-y-auto">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 border-r bg-sidebar">{sidebar}</aside>
        </div>
      ) : null}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
          <Button className="md:hidden" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)} aria-label="Open menu">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
