import { useState } from "react";
import type { ColumnMapping, CsvPreview, ImportReportView, ListRow, MappedField } from "./types.js";

const STANDARD: Array<{ value: MappedField; label: string }> = [
  { value: "email", label: "Email" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "company", label: "Company" },
  { value: "title", label: "Title" },
  { value: "ignore", label: "Ignore" },
];

type ImportCsvPanelProps = {
  lists: ListRow[];
  busy: boolean;
  onParse: (csv: string, hasHeader: boolean) => Promise<CsvPreview>;
  onImport: (input: {
    csv: string;
    hasHeader: boolean;
    mapping: ColumnMapping;
    listIds: string[];
  }) => Promise<ImportReportView>;
};

export function ImportCsvPanel({ lists, busy, onParse, onImport }: ImportCsvPanelProps) {
  const [csv, setCsv] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [listIds, setListIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function readColumns() {
    setError(null);
    setSummary(null);
    try {
      const next = await onParse(csv, hasHeader);
      setPreview(next);
      setMapping(next.mapping);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "Could not read that CSV.");
    }
  }

  async function runImport() {
    setError(null);
    setSummary(null);
    try {
      const report = await onImport({ csv, hasHeader, mapping, listIds });
      setSummary(report.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import that CSV.");
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Import CSV</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Map a column to email. Duplicates, invalid addresses, and suppressed emails are skipped.
      </p>
      <label className="mt-3 block text-sm font-medium text-zinc-800 dark:text-zinc-200" htmlFor="csv-text">
        CSV
      </label>
      <textarea
        id="csv-text"
        className="mt-1 min-h-28 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        value={csv}
        onChange={(event) => setCsv(event.target.value)}
        placeholder={"email,first_name,company\njane@harbor-dental.test,Jane,Harbor Dental"}
      />
      <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void file.text().then(setCsv);
          }}
        />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={hasHeader}
          onChange={(event) => setHasHeader(event.target.checked)}
        />
        First row is a header
      </label>
      <div className="mt-3">
        <button
          type="button"
          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          disabled={busy || csv.trim().length === 0}
          onClick={() => void readColumns()}
        >
          Read columns
        </button>
      </div>
      {preview ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{preview.dataRowCount} data rows.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {mapping.map((column) => (
              <MappingField
                key={column.index}
                column={column}
                header={preview.headers[column.index] ?? `Column ${column.index + 1}`}
                sample={preview.sampleRows[0]?.[column.index] ?? ""}
                onChange={(field) => {
                  setMapping((current) =>
                    current.map((item) => (item.index === column.index ? { ...item, field } : item)),
                  );
                }}
              />
            ))}
          </div>
          {lists.length > 0 ? (
            <fieldset>
              <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Add imported contacts to lists</legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {lists.map((list) => (
                  <label key={list.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={listIds.includes(list.id)}
                      onChange={(event) => {
                        setListIds((current) =>
                          event.target.checked
                            ? [...current, list.id]
                            : current.filter((id) => id !== list.id),
                        );
                      }}
                    />
                    {list.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            disabled={busy}
            onClick={() => void runImport()}
          >
            Import
          </button>
        </div>
      ) : null}
      {summary ? (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-950 dark:text-green-100" role="status">
          {summary}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function MappingField({
  column,
  header,
  sample,
  onChange,
}: {
  column: { index: number; field: MappedField };
  header: string;
  sample: string;
  onChange: (field: MappedField) => void;
}) {
  const custom = column.field.startsWith("custom:") ? column.field.slice("custom:".length) : "";
  const selectValue = column.field.startsWith("custom:") ? "custom" : column.field;
  return (
    <label className="block text-sm text-zinc-700 dark:text-zinc-300">
      <span className="font-medium text-zinc-900 dark:text-zinc-100">{header}</span>
      {sample ? <span className="mt-0.5 block truncate text-xs text-zinc-500">{sample}</span> : null}
      <select
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
        value={selectValue}
        onChange={(event) => {
          const value = event.target.value;
          onChange(value === "custom" ? `custom:field_${column.index + 1}` : (value as MappedField));
        }}
      >
        {STANDARD.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value="custom">Custom field</option>
      </select>
      {selectValue === "custom" ? (
        <input
          className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          aria-label={`Custom field name for ${header}`}
          value={custom}
          onChange={(event) => {
            const slug = event.target.value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
            onChange(slug.length > 0 ? `custom:${slug}` : "custom:field");
          }}
        />
      ) : null}
    </label>
  );
}
