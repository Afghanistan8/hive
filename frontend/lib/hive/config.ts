export const HIVE_CRYPTO_ADDRESS = (process.env.NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS ?? "") as `0x${string}` | "";
export const HIVE_SPORTS_ADDRESS = (process.env.NEXT_PUBLIC_HIVE_SPORTS_ADDRESS ?? "") as `0x${string}` | "";
export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer-studio-dev.genlayer.com").replace(/\/$/, "");
export const STUDIO_URL = "https://studio-next.genlayer.com";

export const GEN = 10n ** 18n;
export const PRICE_SCALE = 10n ** 8n;
export const CRYPTO_MIN_STAKE = 2;
export const CRYPTO_MAX_STAKE = 8;
export const SPORTS_MIN_STAKE = 2;

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;
