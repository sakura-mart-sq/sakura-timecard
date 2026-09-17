import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const rootAssets = resolve(root, "assets");
const distAssets = resolve(dist, "assets");
const constants = readFileSync(resolve(root, "src/lib/constants.js"), "utf8");
const appVersion = constants.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];

if (!appVersion) {
  throw new Error("APP_VERSION was not found in src/lib/constants.js");
}

const distServiceWorker = resolve(dist, "sw.js");
const serviceWorker = readFileSync(distServiceWorker, "utf8").replaceAll("__APP_VERSION__", appVersion);
writeFileSync(distServiceWorker, serviceWorker);

if (existsSync(rootAssets)) {
  rmSync(rootAssets, { recursive: true, force: true });
}

mkdirSync(rootAssets, { recursive: true });
cpSync(distAssets, rootAssets, { recursive: true });
cpSync(resolve(root, "index.html"), resolve(dist, "index.html"));
cpSync(resolve(dist, "manifest.webmanifest"), resolve(root, "manifest.webmanifest"));
cpSync(resolve(dist, "manifest-terminal.webmanifest"), resolve(root, "manifest-terminal.webmanifest"));
cpSync(resolve(dist, "manifest-terminal-test.webmanifest"), resolve(root, "manifest-terminal-test.webmanifest"));
cpSync(distServiceWorker, resolve(root, "sw.js"));
cpSync(resolve(dist, "icon.svg"), resolve(root, "icon.svg"));
