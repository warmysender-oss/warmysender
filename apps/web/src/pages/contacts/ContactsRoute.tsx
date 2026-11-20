import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { ContactsPage } from "./ContactsPage.js";
import type {
  ColumnMapping,
  ContactRow,
  ContactStatus,
  CsvPreview,
  ImportReportView,
  ListRow,
  SuppressionRow,
} from "./types.js";

type ContactsResponse = {
  contacts: ContactRow[];
  lists: ListRow[];
  suppressions: SuppressionRow[];
};

export function ContactsRoute() {
  const [data, setData] = useState<ContactsResponse>({ contacts: [], lists: [], suppressions: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await api<ContactsResponse>("/api/contacts");
    setData(next);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => setError(message(err)));
  }, [load]);

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

  return (
    <ContactsPage
      contacts={data.contacts}
      lists={data.lists}
      suppressions={data.suppressions}
      busy={busy}
      error={error}
      onParse={(csv, hasHeader) =>
        run(() => api<CsvPreview>("/api/contacts/import/preview", { method: "POST", body: JSON.stringify({ csv, hasHeader }) }))
      }
      onImport={async (input: { csv: string; hasHeader: boolean; mapping: ColumnMapping; listIds: string[] }) => {
        const report = await run(() =>
          api<ImportReportView>("/api/contacts/import", { method: "POST", body: JSON.stringify(input) }),
        );
        await load();
        return report;
      }}
      onCreateList={async (name) => {
        await run(() => api("/api/contacts/lists", { method: "POST", body: JSON.stringify({ name }) }));
        await load();
      }}
      onDeleteList={async (listId) => {
        await run(() => api(`/api/contacts/lists/${listId}`, { method: "DELETE" }));
        await load();
      }}
      onSetStatus={async (contactId, status: ContactStatus) => {
        await run(() => api(`/api/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify({ status }) }));
        await load();
      }}
      onSetLists={async (contactId, listIds) => {
        await run(() => api(`/api/contacts/${contactId}/lists`, { method: "PUT", body: JSON.stringify({ listIds }) }));
        await load();
      }}
      onAddSuppression={async (kind, value) => {
        await run(() => api("/api/contacts/suppressions", { method: "POST", body: JSON.stringify({ kind, value }) }));
        await load();
      }}
      onRemoveSuppression={async (id) => {
        await run(() => api(`/api/contacts/suppressions/${id}`, { method: "DELETE" }));
        await load();
      }}
    />
  );
}

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong.";
}
