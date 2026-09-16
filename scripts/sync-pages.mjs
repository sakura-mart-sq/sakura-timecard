import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const rootAssets = resolve(root, "assets");
const distAssets = resolve(dist, "assets");

if (existsSync(rootAssets)) {
  rmSync(rootAssets, { recursive: true, force: true });
}

mkdirSync(rootAssets, { recursive: true });
cpSync(distAssets, rootAssets, { recursive: true });
cpSync(resolve(root, "index.html"), resolve(dist, "index.html"));
cpSync(resolve(dist, "manifest.webmanifest"), resolve(root, "manifest.webmanifest"));
cpSync(resolve(dist, "manifest-terminal.webmanifest"), resolve(root, "manifest-terminal.webmanifest"));
cpSync(resolve(dist, "manifest-terminal-test.webmanifest"), resolve(root, "manifest-terminal-test.webmanifest"));
cpSync(resolve(dist, "sw.js"), resolve(root, "sw.js"));
cpSync(resolve(dist, "icon.svg"), resolve(root, "icon.svg"));
