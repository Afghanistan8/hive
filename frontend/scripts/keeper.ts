// Keeper entrypoint for GitHub Actions (and local runs).
//
//   npm run keeper --workspace frontend              # submit permissionless txs (needs KEEPER_PRIVATE_KEY)
//   npm run keeper --workspace frontend -- --dry     # plan only, nothing signed
//
// Network + contract addresses come from frontend/.env.example (public values).
// KEEPER_PRIVATE_KEY and the optional SUPABASE_* secrets come from the environment.
import { appendFileSync } from "node:fs";
import { runKeeper } from "../lib/keeper/keeper";

const dryRun = process.argv.includes("--dry") || process.env.KEEPER_DRY === "1";
const report = await runKeeper({ dryRun });
// Logs on a public repo are public: never print the signer address or any secret-derived value.
const { signer, ...publicReport } = report;
console.log(JSON.stringify({ ...publicReport, signer: signer ? "configured" : null }, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    `### HIVE keeper — ${report.ranAt}`,
    `- mode: **${report.dryRun ? "dry run" : "live"}**`,
    `- mirror: ${typeof report.mirror === "string" ? report.mirror : JSON.stringify(report.mirror)}`,
    "",
    "| action | target | result |",
    "|---|---|---|",
    ...report.actions.map((a) => `| ${a.kind} | ${a.target} | ${a.hash ? `[tx](https://explorer-studio-dev.genlayer.com/tx/${a.hash})` : a.error ? `error: ${a.error}` : "planned"} |`),
    ...(report.errors.length ? ["", "**Errors**", ...report.errors.map((e) => `- ${e}`)] : []),
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

const failed = report.actions.filter((a) => a.error).length;
if (failed && failed === report.actions.filter((a) => !a.planned).length) process.exitCode = 1;
