// Uploads the keeper secrets in .env.vercel to the Vercel project (production, Sensitive),
// redeploys, and dry-runs the keeper endpoint. Never prints a secret value.
//
//   node scripts/push_vercel_env.mjs            # upload + redeploy + check
//   node scripts/push_vercel_env.mjs --no-deploy

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env.vercel");
const SITE = "https://hive-psi-eight.vercel.app";
const DEPLOYER = "0x4184bc5e5444f250767e8d33a49817a9b4fb0df3";
const skipDeploy = process.argv.includes("--no-deploy");

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

if (!existsSync(ENV_FILE)) fail(".env.vercel not found in the repo root");
if (!["project.json", "repo.json"].some((f) => existsSync(join(ROOT, ".vercel", f)))) fail("repo is not linked to Vercel (run: npx vercel link --project hive)");

let text = readFileSync(ENV_FILE, "utf8");
const env = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
}

if (!env.CRON_SECRET) {
  env.CRON_SECRET = randomBytes(32).toString("hex");
  text = text.replace(/^CRON_SECRET=.*$/m, `CRON_SECRET=${env.CRON_SECRET}`);
  writeFileSync(ENV_FILE, text);
  console.log("• CRON_SECRET generated and saved in .env.vercel");
}

const { Wallet } = createRequire(join(ROOT, "frontend", "package.json"))("ethers");
const uploads = { CRON_SECRET: env.CRON_SECRET };
let address;

if (env.KEEPER_PRIVATE_KEY) {
  const pk = env.KEEPER_PRIVATE_KEY.startsWith("0x") ? env.KEEPER_PRIVATE_KEY : `0x${env.KEEPER_PRIVATE_KEY}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) fail("KEEPER_PRIVATE_KEY must be 64 hex characters (optionally 0x-prefixed)");
  address = new Wallet(pk).address;
  uploads.KEEPER_PRIVATE_KEY = pk;
} else if (env.KEEPER_KEYSTORE_PATH) {
  const path = resolve(ROOT, env.KEEPER_KEYSTORE_PATH);
  if (!existsSync(path)) fail("KEEPER_KEYSTORE_PATH does not point to a file");
  if (!env.KEEPER_KEYSTORE_PASSWORD) fail("KEEPER_KEYSTORE_PASSWORD is empty");
  const json = readFileSync(path, "utf8").trim();
  console.log("• decrypting keystore to verify the password…");
  try {
    address = (await Wallet.fromEncryptedJson(json, env.KEEPER_KEYSTORE_PASSWORD)).address;
  } catch {
    fail("could not decrypt the keystore with KEEPER_KEYSTORE_PASSWORD");
  }
  uploads.KEEPER_KEYSTORE_JSON = JSON.stringify(JSON.parse(json));
  uploads.KEEPER_KEYSTORE_PASSWORD = env.KEEPER_KEYSTORE_PASSWORD;
} else {
  fail("fill KEEPER_PRIVATE_KEY, or KEEPER_KEYSTORE_PATH + KEEPER_KEYSTORE_PASSWORD");
}

if (address.toLowerCase() !== DEPLOYER) {
  fail(`that key belongs to ${address}, not the deployer ${DEPLOYER}`);
}
console.log(`• key verified: deployer ${address}`);

const vercel = (args, input) =>
  spawnSync("npx", ["vercel", ...args], { cwd: ROOT, input, encoding: "utf8", shell: process.platform === "win32" });

for (const [name, value] of Object.entries(uploads)) {
  // Value goes through stdin, never the command line.
  const r = vercel(["env", "add", name, "production", "--sensitive", "--force", "--yes"], value);
  if (r.status !== 0) fail(`uploading ${name} failed:\n${(r.stderr || r.stdout).replaceAll(value, "***")}`);
  console.log(`✓ ${name} set (production, sensitive)`);
}

if (skipDeploy) {
  console.log("Done. Redeploy the project for the values to take effect.");
  process.exit(0);
}

console.log("• redeploying production (a couple of minutes)…");
const deploy = vercel(["redeploy", SITE.replace("https://", ""), "--target", "production"]);
if (deploy.status !== 0) fail(`redeploy failed:\n${deploy.stderr || deploy.stdout}`);
console.log("✓ redeployed");

console.log("• dry-running the keeper (nothing is signed)…");
const res = await fetch(`${SITE}/api/cron/keeper?dry=1`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
const body = await res.json().catch(() => ({}));
if (!res.ok) fail(`keeper check returned HTTP ${res.status}`);
const planned = (body.actions ?? []).map((a) => a.method ?? a.kind ?? a.type).filter(Boolean);
console.log(`✓ keeper reachable (HTTP ${res.status}); planned: ${planned.length ? planned.join(", ") : "nothing due right now"}`);
if (env.KEEPER_KEYSTORE_PATH) console.log("You can now delete the exported keystore file.");
