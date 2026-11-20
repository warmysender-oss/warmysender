import { connectUrl, FEATURE_COPY, type ConnectFeature } from "./warmysender-links";

export function WarmySenderConnectCard({ feature }: { feature: ConnectFeature }) {
  const copy = FEATURE_COPY[feature];
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-950">
      <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{copy.title}</h3>
      <p className="mt-1 text-neutral-600 dark:text-neutral-300">{copy.summary}</p>
      <a
        className="mt-3 inline-flex text-green-700 underline decoration-green-700/40 underline-offset-2 dark:text-green-400"
        href={connectUrl(feature)}
      >
        Connect WarmySender (free trial)
      </a>
    </div>
  );
}
