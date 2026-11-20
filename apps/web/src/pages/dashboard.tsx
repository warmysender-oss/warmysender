import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { firstRunView, type FirstRunInput } from "@/pages/dashboard/first-run";
import { campaignStatCards, mailboxStatLine } from "@/pages/dashboard/stats-cards";

interface StatsResponse {
  campaigns: Array<{
    campaignId: string;
    name: string;
    sent: number;
    replies: number;
    replyRate: number;
    bounces: number;
    unsubscribes: number;
    stillInSequence: number;
  }>;
  mailboxes: Array<{
    mailboxId: string;
    email: string;
    sentToday: number;
    effectiveCap: number;
    rampLabel: string | null;
    health: string;
    paused: boolean;
  }>;
}

export function DashboardPage() {
  const [setup, setSetup] = useState<FirstRunInput | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<FirstRunInput>("/api/setup")
      .then(setSetup)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load setup."));
    void api<StatsResponse>("/api/stats")
      .then(setStats)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Could not load stats."));
  }, []);

  const guide = setup ? firstRunView(setup) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">Campaign totals, mailbox caps, and the first-run checklist.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {guide?.nextStepId ? (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-medium">Get started</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {guide.completedCount} of {guide.total} done
          </p>
          <ol className="mt-4 space-y-3">
            {guide.steps.map((step) => (
              <li key={step.id} className="flex gap-3 text-sm">
                <span className={step.done ? "text-primary" : "text-muted-foreground"}>
                  {step.done ? "Done" : step.id === guide.nextStepId ? "Next" : "To do"}
                </span>
                <span>
                  <span className="font-medium">{step.title}</span>
                  <span className="mt-0.5 block text-muted-foreground">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
      {guide?.demo ? (
        <Card className="mt-6 p-6">
          <h2 className="text-lg font-medium">{guide.demo.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{guide.demo.body}</p>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4">
        {(stats?.campaigns ?? []).map((campaign) => (
          <Card key={campaign.campaignId} className="p-6">
            <h2 className="font-medium">{campaign.name}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {campaignStatCards(campaign).map((card) => (
                <div key={card.label}>
                  <dt className="text-xs text-muted-foreground">{card.label}</dt>
                  <dd className="text-lg font-semibold">{card.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
        {(stats?.mailboxes ?? []).map((mailbox) => {
          const line = mailboxStatLine(mailbox);
          return (
            <Card key={mailbox.mailboxId} className="p-6">
              <h2 className="font-medium">{line.title}</h2>
              <p className="mt-2 text-sm">{line.usage}</p>
              {line.ramp ? <p className="mt-1 text-sm text-muted-foreground">{line.ramp}</p> : null}
              <p className="mt-1 text-sm text-muted-foreground">{line.paused ? "Paused" : line.health}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
