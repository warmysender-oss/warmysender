import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme";

export function AuthScreen({
  title,
  subtitle,
  error,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary px-10 py-10 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
            <Mail className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">WarmySender</span>
        </Link>
        <div>
          <p className="max-w-md text-3xl font-semibold leading-tight">
            Open-source cold email you can self-host.
          </p>
          <p className="mt-4 max-w-md text-sm text-primary-foreground/80">
            The open-source Instantly alternative. Your server, your mailboxes, safe sending limits.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/80">AGPL-3.0</p>
      </div>
      <div className="flex flex-col">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <Card className="w-full max-w-md p-6">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            {error ? (
              <p className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-6">{children}</div>
            {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
