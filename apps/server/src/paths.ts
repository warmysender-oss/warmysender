import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function defaultWebDist(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
}
