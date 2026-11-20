import { useMemo, useState } from "react";
import { ImportCsvPanel } from "./ImportCsvPanel.js";
import {
  CONTACT_STATUSES,
  type ContactRow,
  type ContactStatus,
  type CsvPreview,
  type ImportReportView,
  type ListRow,
  type SuppressionRow,
  type ColumnMapping,
} from "./types.js";

export type ContactsPageProps = {
  contacts: ContactRow[];
  lists: ListRow[];
  suppressions: SuppressionRow[];
  busy: boolean;
  error: string | null;
  onParse: (csv: string, hasHeader: boolean) => Promise<CsvPreview>;
  onImport: (input: {
    csv: string;
    hasHeader: boolean;
    mapping: ColumnMapping;
    listIds: string[];
  }) => Promise<ImportReportView>;
  onCreateList: (name: string) => Promise<void>;
  onDeleteList: (listId: string) => Promise<void>;
  onSetStatus: (contactId: string, status: ContactStatus) => Promise<void>;
  onSetLists: (contactId: string, listIds: string[]) => Promise<void>;
  onAddSuppression: (kind: "email" | "domain", value: string) => Promise<void>;
  onRemoveSuppression: (id: string) => Promise<void>;
};

export function ContactsPage(props: ContactsPageProps) {
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState<string>("all");
  const [showImport, setShowImport] = useState(false);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return props.contacts.filter((contact) => {
      if (listFilter !== "all" && !contact.listIds.includes(listFilter)) return false;
      if (!needle) return true;
      return [contact.email, contact.firstName, contact.lastName, contact.company, contact.title]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [props.contacts, query, listFilter]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Import a CSV, organize lists, and keep a suppression list for emails and domains.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          onClick={() => setShowImport((open) => !open)}
        >
          {showImport ? "Hide import" : "Import CSV"}
        </button>
      </header>
      {props.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-100" role="alert">
          {props.error}
        </p>
      ) : null}
      {showImport ? (
        <ImportCsvPanel lists={props.lists} busy={props.busy} onParse={props.onParse} onImport={props.onImport} />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <ListsCard
            lists={props.lists}
            selected={listFilter}
            busy={props.busy}
            onSelect={setListFilter}
            onCreate={props.onCreateList}
            onDelete={props.onDeleteList}
          />
          <SuppressionCard
            rows={props.suppressions}
            busy={props.busy}
            onAdd={props.onAddSuppression}
            onRemove={props.onRemoveSuppression}
          />
        </aside>
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
            <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="contact-search">
              Search
            </label>
            <input
              id="contact-search"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Email, name, or company"
            />
          </div>
          {visible.length === 0 ? (
            <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">No contacts yet. Import a CSV to add some.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Company</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Lists</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((contact) => (
                    <tr key={contact.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900 dark:text-zinc-50">{contact.email}</div>
                        {contact.suppressed ? (
                          <div className="text-xs text-amber-700 dark:text-amber-300">Suppressed</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{contact.company || "—"}</td>
                      <td className="px-4 py-3">
                        <label className="sr-only" htmlFor={`status-${contact.id}`}>
                          Status for {contact.email}
                        </label>
                        <select
                          id={`status-${contact.id}`}
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                          value={contact.status}
                          disabled={props.busy}
                          onChange={(event) => void props.onSetStatus(contact.id, event.target.value as ContactStatus)}
                        >
                          {CONTACT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {props.lists.map((list) => {
                            const checked = contact.listIds.includes(list.id);
                            return (
                              <label key={list.id} className="flex items-center gap-1 text-xs text-zinc-700 dark:text-zinc-300">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={props.busy}
                                  onChange={(event) => {
                                    const next = event.target.checked
                                      ? [...contact.listIds, list.id]
                                      : contact.listIds.filter((id) => id !== list.id);
                                    void props.onSetLists(contact.id, next);
                                  }}
                                />
                                {list.name}
                              </label>
                            );
                          })}
                          {props.lists.length === 0 ? <span className="text-xs text-zinc-500">No lists</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ListsCard({
  lists,
  selected,
  busy,
  onSelect,
  onCreate,
  onDelete,
}: {
  lists: ListRow[];
  selected: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Lists</h2>
      <div className="mt-2 flex flex-col gap-1">
        <button type="button" className={filterClass(selected === "all")} onClick={() => onSelect("all")}>
          All contacts
        </button>
        {lists.map((list) => (
          <div key={list.id} className="flex items-center gap-1">
            <button type="button" className={filterClass(selected === list.id)} onClick={() => onSelect(list.id)}>
              {list.name}
            </button>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-red-700"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete the list "${list.name}"? Contacts stay in the account.`)) {
                  void onDelete(list.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = name.trim();
          if (!next) return;
          void onCreate(next).then(() => setName(""));
        }}
      >
        <label className="sr-only" htmlFor="new-list">
          New list name
        </label>
        <input
          id="new-list"
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New list"
        />
        <button type="submit" className="rounded-lg border border-zinc-300 px-2 text-sm dark:border-zinc-700" disabled={busy}>
          Add
        </button>
      </form>
    </section>
  );
}

function SuppressionCard({
  rows,
  busy,
  onAdd,
  onRemove,
}: {
  rows: SuppressionRow[];
  busy: boolean;
  onAdd: (kind: "email" | "domain", value: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<"email" | "domain">("email");
  const [value, setValue] = useState("");
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Suppression</h2>
      <p className="mt-1 text-xs text-zinc-500">Bounced and unsubscribed contacts are added here automatically.</p>
      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          if (!next) return;
          void onAdd(kind, next).then(() => setValue(""));
        }}
      >
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="suppression-kind">
          Kind
        </label>
        <select
          id="suppression-kind"
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          value={kind}
          onChange={(event) => setKind(event.target.value as "email" | "domain")}
        >
          <option value="email">Email</option>
          <option value="domain">Domain</option>
        </select>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor="suppression-value">
          Value
        </label>
        <input
          id="suppression-value"
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={kind === "email" ? "jane@harbor-dental.test" : "harbor-dental.test"}
        />
        <button type="submit" className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700" disabled={busy}>
          Suppress
        </button>
      </form>
      <ul className="mt-3 space-y-1 text-sm">
        {rows.length === 0 ? <li className="text-zinc-500">Nothing suppressed.</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-zinc-800 dark:text-zinc-200">
              {row.kind === "domain" ? `@${row.value}` : row.value}
            </span>
            <button type="button" className="text-xs text-zinc-500 hover:text-red-700" disabled={busy} onClick={() => void onRemove(row.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function filterClass(active: boolean): string {
  return active
    ? "rounded-lg bg-green-50 px-2 py-1 text-left text-sm font-medium text-green-800 dark:bg-green-950 dark:text-green-100"
    : "rounded-lg px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800";
}
