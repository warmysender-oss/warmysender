import { useState } from "react";
import { WarmySenderConnectCard } from "./WarmySenderConnectCard";
import { LEADS_IMPORT_MESSAGE, LEADS_SEARCH_URL } from "./warmysender-links";

export function FindLeadsLink({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button type="button" className="rounded-md bg-green-700 px-3 py-2 text-sm text-white" onClick={() => setOpen(true)}>
        Find leads
      </button>
      {open && !connected ? <WarmySenderConnectCard feature="leads" /> : null}
      {open && connected ? (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p>{LEADS_IMPORT_MESSAGE}</p>
          <a className="mt-3 inline-flex text-green-700 underline dark:text-green-400" href={LEADS_SEARCH_URL}>
            Open WarmySender leads search
          </a>
        </div>
      ) : null}
    </div>
  );
}
