// Fails (exit 1) if any exported n8n workflow JSON could leak a secret.
// Prints file names and variable NAMES only, never a value.
// Usage: node scripts/check-workflows.mjs [dir]   (or CHECK_WORKFLOWS_DIR=dir)
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? process.env.CHECK_WORKFLOWS_DIR ?? "n8n/workflows");
const ENV_FILES = [".env.local", ".env.n8n", ".env.secrets"];
const PATTERNS = ["sk_test_", "sk_live_", "-----BEGIN"];
const BAD_PARAMS = new Set(["secret", "password", "passphrase"]);
const ALLOWED_EMAIL = "lendloop@localhost";
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*/g;

function readEnvValues() {
  const out = []; // { file, name, value }
  for (const file of ENV_FILES) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // missing files are fine
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let value = m[2].trim();
      if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
      if (value.length < 8) continue;
      if (/^(true|false)$/i.test(value) || /^-?\d+(\.\d+)?$/.test(value)) continue;
      out.push({ file, name: m[1], value });
    }
  }
  return out;
}

function* walk(node, trail = []) {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      yield [k, v, trail];
      yield* walk(v, [...trail, k]);
    }
  }
}

const problems = [];
const envValues = readEnvValues();

let files;
try {
  files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
} catch {
  console.error(`check-workflows: cannot read directory ${dir}`);
  process.exit(2);
}

for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  for (const e of envValues) {
    if (text.includes(e.value)) problems.push(`${f}: contains the value of ${e.name} (from ${e.file})`);
  }
  for (const p of PATTERNS) {
    if (text.includes(p)) problems.push(`${f}: contains secret pattern "${p}"`);
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    if (m[0] !== ALLOWED_EMAIL) {
      problems.push(`${f}: contains an email-shaped string`);
      break;
    }
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    problems.push(`${f}: not valid JSON`);
    continue;
  }
  for (const [key, value, trail] of walk(json)) {
    if (trail.includes("parameters") && BAD_PARAMS.has(key.toLowerCase())) {
      problems.push(`${f}: node parameter named "${key}" at ${[...trail, key].join(".")}`);
    }
    if (key === "pinData" && value && typeof value === "object" && Object.keys(value).length > 0) {
      problems.push(`${f}: non-empty pinData`);
    }
  }
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log(`check-workflows: ${files.length} file(s) in ${path.relative(process.cwd(), dir) || "."} are clean`);
