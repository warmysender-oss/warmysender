import { runWiredDoctor } from "../apps/server/src/mailboxes/doctor-run.js";

const code = await runWiredDoctor();
process.exit(code);
