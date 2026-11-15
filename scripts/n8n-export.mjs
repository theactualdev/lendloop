// Exports only the "LendLoop · " workflows, by id, one pretty file each into
// n8n/workflows/. Never uses --all, so Spike/Scratch workflows are never exported.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT_DIR = "n8n/workflows";
const PREFIX = "LendLoop · ";
const FILES = {
  llErrorHandler01: "error-handler.json",
  llRequestNotif01: "request-notification.json",
  llOverdueRemind1: "overdue-reminders.json",
};

const isEmpty = (v) => v == null || (typeof v === "object" && Object.keys(v).length === 0);

// n8n exports a one-item array plus volatile metadata (timestamps, project ids, version counters).
// `import:workflow --separate` wants ONE workflow object with `nodes` and `connections`, and
// regenerates the rest itself. Keep only the stable, meaningful fields, in a fixed key order.
// `active` is dropped: import deactivates anyway and publish:workflow activates.
export function normalizeWorkflow(exported) {
  let w = exported;
  if (Array.isArray(w)) {
    if (w.length !== 1) throw new Error(`expected exactly one workflow, got ${w.length}`);
    w = w[0];
  }
  if (!w || typeof w !== "object" || !Array.isArray(w.nodes) || !w.connections || typeof w.connections !== "object") {
    throw new Error("not a workflow object (needs nodes array and connections object)");
  }
  return {
    id: w.id,
    name: w.name,
    nodes: w.nodes,
    connections: w.connections,
    settings: w.settings ?? {},
    staticData: w.staticData ?? null,
    meta: w.meta ?? null,
    pinData: isEmpty(w.pinData) ? {} : w.pinData,
    tags: [],
  };
}

export function writeNormalized(file, exported) {
  fs.writeFileSync(file, `${JSON.stringify(normalizeWorkflow(exported), null, 2)}\n`);
}

function n8n(args) {
  const r = spawnSync("npx", ["dotenv", "-e", ".env.n8n", "--", "n8n", ...args], {
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

function main() {
  const all = n8n(["list:workflow"])
    .split(/\r?\n/)
    .map((l) => /^([^|]+)\|(.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ id: m[1].trim(), name: m[2].trim() }));
  const listed = all.filter((w) => w.name.startsWith(PREFIX));

  // Guard against console-encoding damage to the middle dot: a name that starts with
  // "LendLoop" but fails the prefix test means the match is broken.
  const odd = all.filter((w) => /^LendLoop/.test(w.name) && !w.name.startsWith(PREFIX));
  if (odd.length) {
    console.error("Workflow(s) start with LendLoop but not the expected prefix (encoding?):", odd.map((w) => w.id).join(", "));
    process.exit(1);
  }
  if (listed.length === 0) {
    console.error(`No workflows named "${PREFIX}…" found.`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const w of listed) {
    const slug = w.name.slice(PREFIX.length).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const file = path.join(OUT_DIR, FILES[w.id] ?? `${slug}.json`);
    n8n(["export:workflow", `--id=${w.id}`, "--pretty", `--output=${file}`]);
    writeNormalized(file, JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(`exported ${w.id} (${w.name}) -> ${file}`);
  }
  console.log(`exported ${listed.length} of ${all.length} workflow(s). Now run: npm run check:secrets`);
}

function normalizeExisting() {
  for (const f of fs.readdirSync(OUT_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const file = path.join(OUT_DIR, f);
    writeNormalized(file, JSON.parse(fs.readFileSync(file, "utf8")));
    console.log(`normalized ${file}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.argv.includes("--normalize")) normalizeExisting();
  else main();
}
