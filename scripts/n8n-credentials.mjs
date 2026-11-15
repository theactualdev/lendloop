// Creates (or updates) the three n8n credentials LendLoop's workflows use, with
// fixed ids so the exported workflow JSON can point at them:
//   - JWT  "LendLoop → n8n"  (lendloopToN8n01)  passphrase = LENDLOOP_TO_N8N_SECRET, HS256
//   - JWT  "n8n → LendLoop"  (n8nToLendloop01)  passphrase = N8N_TO_LENDLOOP_SECRET, HS256
//   - SMTP "Mailpit"         (mailpitSmtp00001) 127.0.0.1:1025, no TLS, no auth
// The secrets come from .env.secrets. They are written to a temp file outside the
// repo (OS temp dir), imported with `n8n import:credentials`, and the file is deleted
// in `finally`, and also on Ctrl+C or SIGTERM. Values are never printed: errors name the variable only, and n8n's
// own output is scrubbed of the values before it is shown.
// Importing again over the same ids updates the credentials in place.
// Usage: npm run n8n:credentials
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

const SECRETS_FILE = ".env.secrets";
const N8N_ENV_FILE = ".env.n8n";
const SECRET_NAMES = ["LENDLOOP_TO_N8N_SECRET", "N8N_TO_LENDLOOP_SECRET"];

function die(message) {
  console.error(`n8n-credentials: ${message}`);
  process.exit(1);
}

function readSecrets() {
  let text;
  try {
    text = fs.readFileSync(SECRETS_FILE, "utf8");
  } catch {
    die(`${SECRETS_FILE} not found. Create it from ${SECRETS_FILE}.example (see README).`);
  }
  let env;
  try {
    env = parseEnv(text);
  } catch {
    die(`${SECRETS_FILE} could not be parsed.`);
  }
  const out = {};
  for (const name of SECRET_NAMES) {
    const value = env[name]?.trim();
    if (!value) die(`${name} is missing or empty in ${SECRETS_FILE}.`);
    out[name] = value;
  }
  return out;
}

if (!fs.existsSync(N8N_ENV_FILE)) {
  die(`${N8N_ENV_FILE} not found. Create it from ${N8N_ENV_FILE}.example (see README).`);
}
const secrets = readSecrets();

const credentials = [
  {
    id: "lendloopToN8n01",
    name: "LendLoop → n8n",
    type: "jwtAuth",
    data: { keyType: "passphrase", secret: secrets.LENDLOOP_TO_N8N_SECRET, algorithm: "HS256" },
  },
  {
    id: "n8nToLendloop01",
    name: "n8n → LendLoop",
    type: "jwtAuth",
    data: { keyType: "passphrase", secret: secrets.N8N_TO_LENDLOOP_SECRET, algorithm: "HS256" },
  },
  {
    id: "mailpitSmtp00001",
    name: "Mailpit",
    type: "smtp",
    data: {
      user: "",
      password: "",
      host: "127.0.0.1",
      port: 1025,
      secure: false,
      disableStartTls: true,
    },
  },
];

// dotenv-cli is run through node (no shell), so a temp path with spaces is safe.
const dotenvCli = createRequire(import.meta.url).resolve("dotenv-cli/cli.js");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lendloop-n8n-"));
const file = path.join(tmpDir, "credentials.json");
const removeTmp = () => fs.rmSync(tmpDir, { recursive: true, force: true });

// Without a listener, Ctrl+C (SIGINT) or a kill (SIGTERM) ends Node at once and
// `finally` never runs, leaving the plaintext secrets in the temp dir. With one,
// Node waits for the n8n child (which gets Ctrl+C too), `finally` deletes the
// file, and if the handler still runs it deletes it (again) and exits.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.on(signal, () => {
    removeTmp();
    console.error(`n8n-credentials: interrupted (${signal}); the temp file was deleted.`);
    process.exit(code);
  });
}

let status = 1;
try {
  fs.writeFileSync(file, JSON.stringify(credentials), { mode: 0o600 });
  console.log("Importing 3 credentials into n8n (the CLI can take a minute or two)...");
  const r = spawnSync(
    process.execPath,
    [dotenvCli, "-e", N8N_ENV_FILE, "--", "n8n", "import:credentials", `--input=${file}`],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const scrub = (s) =>
    Object.values(secrets).reduce((acc, value) => acc.split(value).join("<redacted>"), s ?? "");
  const out = scrub(r.stdout).trim();
  const err = scrub(r.stderr).trim();
  if (out) console.log(out);
  if (err) console.error(err);
  if (r.error) console.error(`n8n-credentials: could not run n8n (${r.error.code ?? r.error.name}). Is n8n on PATH?`);
  status = r.status ?? 1;
} finally {
  removeTmp();
}

if (status !== 0) die(`n8n import:credentials failed (exit ${status}).`);
console.log('Imported: "LendLoop → n8n" (lendloopToN8n01), "n8n → LendLoop" (n8nToLendloop01), "Mailpit" (mailpitSmtp00001).');
