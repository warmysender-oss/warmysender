import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { CampaignsPage } from "./CampaignsPage.js";
import type {
  CampaignDetail,
  CampaignSummary,
  ContactOption,
  LaunchIssueView,
  ListOption,
  MailboxOption,
  StepContentType,
  StepPreviewView,
} from "./types.js";

type Board = {
  campaigns: CampaignSummary[];
  mailboxes: MailboxOption[];
  contacts: ContactOption[];
  lists: ListOption[];
};

export function CampaignsRoute() {
  const [board, setBoard] = useState<Board>({ campaigns: [], mailboxes: [], contacts: [], lists: [] });
  const [selected, setSelected] = useState<CampaignDetail | null>(null);
  const [issues, setIssues] = useState<LaunchIssueView[] | null>(null);
  const [preview, setPreview] = useState<StepPreviewView | null>(null);
  const [previewStepId, setPreviewStepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    const next = await api<Board>("/api/campaigns");
    setBoard(next);
  }, []);

  const loadCampaign = useCallback(async (campaignId: string) => {
    const data = await api<{ campaign: CampaignDetail }>(`/api/campaigns/${campaignId}`);
    setSelected(data.campaign);
  }, []);

  useEffect(() => {
    void loadBoard().catch((err: unknown) => setError(message(err)));
  }, [loadBoard]);

  async function run<T>(work: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await work();
    } catch (err) {
      setError(message(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function refresh(campaignId: string) {
    await Promise.all([loadBoard(), loadCampaign(campaignId)]);
  }

  return (
    <CampaignsPage
      campaigns={board.campaigns}
      selected={selected}
      busy={busy}
      error={error}
      onCreate={async (name) => {
        const created = await run(() =>
          api<{ campaign: CampaignDetail }>("/api/campaigns", { method: "POST", body: JSON.stringify({ name }) }),
        );
        await loadBoard();
        setSelected(created.campaign);
        setIssues(null);
      }}
      onSelect={(campaignId) => {
        setIssues(null);
        setPreview(null);
        void loadCampaign(campaignId).catch((err: unknown) => setError(message(err)));
      }}
      builder={
        selected
          ? {
              mailboxes: board.mailboxes,
              contacts: board.contacts,
              lists: board.lists,
              issues,
              preview,
              previewStepId,
              onRename: async (name) => {
                await run(() => api(`/api/campaigns/${selected.id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
                await refresh(selected.id);
              },
              onAddStep: async () => {
                await run(() => api(`/api/campaigns/${selected.id}/steps`, { method: "POST", body: JSON.stringify({}) }));
                await refresh(selected.id);
              },
              onUpdateStep: async (stepId, patch: { subject?: string; body?: string; delayDays?: number; contentType?: StepContentType }) => {
                await run(() =>
                  api(`/api/campaigns/${selected.id}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify(patch) }),
                );
                await refresh(selected.id);
              },
              onDeleteStep: async (stepId) => {
                await run(() => api(`/api/campaigns/${selected.id}/steps/${stepId}`, { method: "DELETE" }));
                await refresh(selected.id);
              },
              onSetMailboxes: async (mailboxIds) => {
                await run(() =>
                  api(`/api/campaigns/${selected.id}/mailboxes`, { method: "PUT", body: JSON.stringify({ mailboxIds }) }),
                );
                await refresh(selected.id);
              },
              onSetAudience: async (input) => {
                await run(() =>
                  api(`/api/campaigns/${selected.id}/audience`, { method: "PUT", body: JSON.stringify(input) }),
                );
                await refresh(selected.id);
              },
              onPreview: async (stepId, contactId) => {
                const data = await run(() =>
                  api<{ preview: StepPreviewView; previewStepId: string }>(`/api/campaigns/${selected.id}/preview`, {
                    method: "POST",
                    body: JSON.stringify({ stepId, contactId }),
                  }),
                );
                setPreview(data.preview);
                setPreviewStepId(data.previewStepId);
              },
              onLaunchCheck: async () => {
                const data = await run(() =>
                  api<{ issues: LaunchIssueView[] }>(`/api/campaigns/${selected.id}/launch-check`, { method: "POST" }),
                );
                setIssues(data.issues);
              },
              onStart: async () => {
                await run(() => api(`/api/campaigns/${selected.id}/start`, { method: "POST" }));
                setIssues(null);
                await refresh(selected.id);
              },
              onPause: async () => {
                await run(() => api(`/api/campaigns/${selected.id}/pause`, { method: "POST" }));
                await refresh(selected.id);
              },
              onDelete: async () => {
                await run(() => api(`/api/campaigns/${selected.id}`, { method: "DELETE" }));
                setSelected(null);
                await loadBoard();
              },
            }
          : null
      }
    />
  );
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong.";
}
