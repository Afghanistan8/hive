// Creates a fresh keeper wallet for the HIVE cron. Run it yourself and paste the
// private key ONLY into Vercel's KEEPER_PRIVATE_KEY (encrypted env). Never commit it.
//
//   node scripts/keeper_wallet.mjs
//
// Then fund the printed address from your deployer:
//   npx genlayer account send <address> 5
import { createAccount, generatePrivateKey } from "genlayer-js";

const privateKey = generatePrivateKey();
const { address } = createAccount(privateKey);
console.log(`Keeper address : ${address}`);
console.log(`Private key    : ${privateKey}`);
console.log("\nStore the key in Vercel → Settings → Environment Variables → KEEPER_PRIVATE_KEY (sensitive).");
