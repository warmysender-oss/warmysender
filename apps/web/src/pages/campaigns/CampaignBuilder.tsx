import { useEffect, useState } from "react";
import type {
  CampaignDetail,
  CampaignStepView,
  ContactOption,
  LaunchIssueView,
  ListOption,
  MailboxOption,
  StepContentType,
  StepPreviewView,
} from "./types.js";

export type CampaignBuilderProps = {
  campaign: CampaignDetail;
  mailboxes: MailboxOption[];
  contacts: ContactOption[];
  lists: ListOption[];
  issues: LaunchIssueView[] | null;
  preview: StepPreviewView | null;
  previewStepId: string | null;
  busy: boolean;
  error: string | null;
  onRename: (name: string) => Promise<void>;
  onAddStep: () => Promise<void>;
  onUpdateStep: (
    stepId: string,
    patch: { subject?: string; body?: string; delayDays?: number; contentType?: StepContentType },
  ) => Promise<void>;
  onDeleteStep: (stepId: string) => Promise<void>;
  onSetMailboxes: (mailboxIds: string[]) => Promise<void>;
  onSetAudience: (input: { contactIds: string[]; listIds: string[] }) => Promise<void>;
  onPreview: (stepId: string, contactId: string) => Promise<void>;
  onLaunchCheck: () => Promise<void>;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onDelete: () => Promise<void>;
};

export function CampaignBuilder(props: CampaignBuilderProps) {
  const locked = props.campaign.state === "running" || props.campaign.state === "completed";
  const blocking = (props.issues ?? []).filter((issue) => issue.blocking);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <NameField name={props.campaign.name} busy={props.busy} onRename={props.onRename} />
        <StateBadge state={props.campaign.state} />
      </header>
      {props.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-100" role="alert">
          {props.error}
        </p>
      ) : null}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Steps</h2>
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700"
            disabled={props.busy || locked}
            onClick={() => void props.onAddStep()}
          >
            Add step
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Variables: {"{{first_name|there}}"}, {"{{last_name}}"}, {"{{company}}"}, {"{{title}}"}, {"{{email}}"}, {"{{unsubscribe_link}}"}, plus any custom field.
          Plain text is the default. Follow-ups stay in the same thread when sending starts.
        </p>
        {props.campaign.steps.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No steps yet. Add the first email. Its delay stays at 0 days.</p>
        ) : null}
        {props.campaign.steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            busy={props.busy}
            locked={locked}
            contacts={props.contacts}
            preview={props.previewStepId === step.id ? props.preview : null}
            onUpdate={props.onUpdateStep}
            onDelete={props.onDeleteStep}
            onPreview={props.onPreview}
          />
        ))}
      </section>
      <MailboxPicker
        mailboxes={props.mailboxes}
        selected={props.campaign.mailboxIds}
        disabled={props.busy || locked}
        onChange={(mailboxIds) => void props.onSetMailboxes(mailboxIds)}
      />
      <AudiencePicker
        contacts={props.contacts}
        lists={props.lists}
        contactIds={props.campaign.contactIds}
        listIds={props.campaign.listIds}
        disabled={props.busy || locked}
        onChange={(input) => void props.onSetAudience(input)}
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Launch check</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Start marks the campaign running and enrolls active contacts. It does not send email. The scheduler sends later.
        </p>
        {props.issues === null ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Run a check to see problems in words before starting.</p>
        ) : props.issues.length === 0 ? (
          <p className="mt-2 text-sm text-green-800 dark:text-green-200">Nothing to fix. This campaign can start.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {props.issues.map((issue, index) => (
              <li
                key={`${issue.code}-${index}`}
                className={issue.blocking ? "text-sm text-red-700 dark:text-red-300" : "text-sm text-amber-700 dark:text-amber-300"}
              >
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            disabled={props.busy}
            onClick={() => void props.onLaunchCheck()}
          >
            Check before launch
          </button>
          {props.campaign.state === "running" ? (
            <button
              type="button"
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              disabled={props.busy}
              onClick={() => void props.onPause()}
            >
              Pause
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              disabled={props.busy || props.campaign.state === "completed" || blocking.length > 0}
              onClick={() => void props.onStart()}
            >
              {props.campaign.state === "paused" ? "Resume" : "Start"}
            </button>
          )}
          {props.campaign.state === "draft" ? (
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-red-700"
              disabled={props.busy}
              onClick={() => {
                if (window.confirm(`Delete the draft "${props.campaign.name}"?`)) void props.onDelete();
              }}
            >
              Delete draft
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function NameField({
  name,
  busy,
  onRename,
}: {
  name: string;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onRename(value);
      }}
    >
      <label className="block text-xs font-medium text-zinc-500" htmlFor="campaign-name">
        Campaign name
      </label>
      <input
        id="campaign-name"
        className="mt-1 w-72 max-w-full rounded-lg border border-zinc-300 px-3 py-2 text-lg font-semibold dark:border-zinc-700 dark:bg-zinc-950"
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value.trim() && value.trim() !== name) void onRename(value);
        }}
      />
    </form>
  );
}

function StateBadge({ state }: { state: CampaignDetail["state"] }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {state}
    </span>
  );
}

function StepCard({
  step,
  busy,
  locked,
  contacts,
  preview,
  onUpdate,
  onDelete,
  onPreview,
}: {
  step: CampaignStepView;
  busy: boolean;
  locked: boolean;
  contacts: ContactOption[];
  preview: StepPreviewView | null;
  onUpdate: CampaignBuilderProps["onUpdateStep"];
  onDelete: (stepId: string) => Promise<void>;
  onPreview: (stepId: string, contactId: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState(step.subject);
  const [body, setBody] = useState(step.body);
  const [delayDays, setDelayDays] = useState(String(step.delayDays));
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  useEffect(() => {
    setSubject(step.subject);
    setBody(step.body);
    setDelayDays(String(step.delayDays));
  }, [step.subject, step.body, step.delayDays]);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Step {step.position}</h3>
        <button type="button" className="text-xs text-zinc-500 hover:text-red-700" disabled={busy || locked} onClick={() => void onDelete(step.id)}>
          Remove
        </button>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_140px]">
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Subject</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            value={subject}
            disabled={locked}
            onChange={(event) => setSubject(event.target.value)}
            onBlur={() => {
              if (subject !== step.subject) void onUpdate(step.id, { subject });
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Delay (days)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            type="number"
            min={0}
            step={1}
            value={step.position === 1 ? "0" : delayDays}
            disabled={locked || step.position === 1}
            onChange={(event) => setDelayDays(event.target.value)}
            onBlur={() => {
              const parsed = Number(delayDays);
              if (Number.isInteger(parsed) && parsed !== step.delayDays) void onUpdate(step.id, { delayDays: parsed });
            }}
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Body</span>
        <textarea
          className="mt-1 min-h-28 w-full rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          value={body}
          disabled={locked}
          onChange={(event) => setBody(event.target.value)}
          onBlur={() => {
            if (body !== step.body) void onUpdate(step.id, { body });
          }}
        />
      </label>
      <label className="mt-2 block text-sm text-zinc-600 dark:text-zinc-400">
        Format
        <select
          className="mt-1 rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          value={step.contentType}
          disabled={locked}
          onChange={(event) => void onUpdate(step.id, { contentType: event.target.value as StepContentType })}
        >
          <option value="text">Plain text</option>
          <option value="html">Simple HTML</option>
        </select>
      </label>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Preview with
          <select
            className="mt-1 block rounded-lg border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
          >
            {contacts.length === 0 ? <option value="">No contacts yet</option> : null}
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.firstName ? `${contact.firstName} · ${contact.email}` : contact.email}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          disabled={busy || contactId.length === 0}
          onClick={() => void onPreview(step.id, contactId)}
        >
          Preview
        </button>
      </div>
      {preview ? (
        <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
          <p className="text-xs text-zinc-500">Preview does not send email.</p>
          <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">{preview.subject || "(empty subject)"}</p>
          {preview.contentType === "html" ? (
            <div className="mt-2 text-zinc-800 dark:text-zinc-200" dangerouslySetInnerHTML={{ __html: preview.body }} />
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{preview.body}</p>
          )}
          {preview.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-amber-700 dark:text-amber-300">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function MailboxPicker({
  mailboxes,
  selected,
  disabled,
  onChange,
}: {
  mailboxes: MailboxOption[];
  selected: string[];
  disabled: boolean;
  onChange: (mailboxIds: string[]) => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Mailboxes</h2>
      <p className="mt-1 text-xs text-zinc-500">Each contact stays on the mailbox that sends step 1. Rotation happens at send time.</p>
      {mailboxes.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Connect a mailbox before launching.</p>
      ) : (
        <div className="mt-2 space-y-1">
          {mailboxes.map((mailbox) => (
            <label key={mailbox.id} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={selected.includes(mailbox.id)}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, mailbox.id]
                    : selected.filter((id) => id !== mailbox.id);
                  onChange(next);
                }}
              />
              {mailbox.address}
              {mailbox.paused ? <span className="text-xs text-amber-700">Paused</span> : null}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function AudiencePicker({
  contacts,
  lists,
  contactIds,
  listIds,
  disabled,
  onChange,
}: {
  contacts: ContactOption[];
  lists: ListOption[];
  contactIds: string[];
  listIds: string[];
  disabled: boolean;
  onChange: (input: { contactIds: string[]; listIds: string[] }) => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Audience</h2>
      <p className="mt-1 text-xs text-zinc-500">A contact can be in more than one list. Suppressed contacts are not enrolled.</p>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="text-xs font-medium text-zinc-500">Lists</legend>
          {lists.length === 0 ? <p className="mt-1 text-sm text-zinc-500">No lists yet.</p> : null}
          {lists.map((list) => (
            <label key={list.id} className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={listIds.includes(list.id)}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.checked ? [...listIds, list.id] : listIds.filter((id) => id !== list.id);
                  onChange({ contactIds, listIds: next });
                }}
              />
              {list.name}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="text-xs font-medium text-zinc-500">Contacts</legend>
          {contacts.length === 0 ? <p className="mt-1 text-sm text-zinc-500">Import contacts first.</p> : null}
          {contacts.map((contact) => (
            <label key={contact.id} className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={contactIds.includes(contact.id)}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...contactIds, contact.id]
                    : contactIds.filter((id) => id !== contact.id);
                  onChange({ contactIds: next, listIds });
                }}
              />
              {contact.email}
              <span className="text-xs text-zinc-500">{contact.status}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
