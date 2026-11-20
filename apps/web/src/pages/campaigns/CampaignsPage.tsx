import { useState } from "react";
import { CampaignBuilder, type CampaignBuilderProps } from "./CampaignBuilder.js";
import type { CampaignDetail, CampaignSummary } from "./types.js";

export type CampaignsPageProps = {
  campaigns: CampaignSummary[];
  selected: CampaignDetail | null;
  busy: boolean;
  error: string | null;
  onCreate: (name: string) => Promise<void>;
  onSelect: (campaignId: string) => void;
  builder: Omit<CampaignBuilderProps, "campaign" | "busy" | "error"> | null;
};

export function CampaignsPage({ campaigns, selected, busy, error, onCreate, onSelect, builder }: CampaignsPageProps) {
  const [name, setName] = useState("");
  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Campaigns</h1>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = name.trim();
            if (!next) return;
            void onCreate(next).then(() => setName(""));
          }}
        >
          <label className="sr-only" htmlFor="new-campaign">
            New campaign name
          </label>
          <input
            id="new-campaign"
            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New campaign"
          />
          <button type="submit" className="rounded-lg bg-green-600 px-2 text-sm font-medium text-white" disabled={busy}>
            Add
          </button>
        </form>
        {campaigns.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No campaigns yet.</p>
        ) : (
          <ul className="space-y-1">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <button
                  type="button"
                  className={
                    selected?.id === campaign.id
                      ? "w-full rounded-lg bg-green-50 px-2 py-2 text-left text-sm dark:bg-green-950"
                      : "w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }
                  onClick={() => onSelect(campaign.id)}
                >
                  <span className="block font-medium text-zinc-900 dark:text-zinc-50">{campaign.name}</span>
                  <span className="text-xs uppercase text-zinc-500">{campaign.state}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section>
        {error ? (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-100" role="alert">
            {error}
          </p>
        ) : null}
        {selected && builder ? (
          <CampaignBuilder campaign={selected} busy={busy} error={null} {...builder} />
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Create a campaign, add steps, choose mailboxes and contacts, then run the launch check.
          </p>
        )}
      </section>
    </div>
  );
}
