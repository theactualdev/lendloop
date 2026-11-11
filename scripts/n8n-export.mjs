// Exports only the "LendLoop · " workflows, by id, one pretty file each into
// n8n/workflows/. Never uses --all, so Spike/Scratch workflows are never exported.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "n8n/workflows";
const PREFIX = "LendLoop · ";
const FILES = {
  llErrorHandler01: "error-handler.json",
  llRequestNotif01: "request-notification.json",
  llOverdueRemind1: "overdue-reminders.json",
};

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
  const text = fs.readFileSync(file, "utf8");
  if (!text.endsWith("\n")) fs.writeFileSync(file, `${text}\n`);
  console.log(`exported ${w.id} (${w.name}) -> ${file}`);
}
console.log(`exported ${listed.length} of ${all.length} workflow(s). Now run: npm run check:secrets`);
