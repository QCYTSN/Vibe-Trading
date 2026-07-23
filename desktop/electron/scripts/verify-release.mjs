import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const releaseDir = path.join(root, "release");
const files = await readdir(releaseDir);
const base = `Vibe-Trading-Desktop-Community-${pkg.version}-x64.exe`;
const required = [base, `${base}.blockmap`];
if (process.env.VIBE_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY) required.push("latest.yml");

for (const name of required) {
  if (!files.includes(name)) throw new Error(`Missing release asset: ${name}`);
  if ((await stat(path.join(releaseDir, name))).size === 0) throw new Error(`Empty release asset: ${name}`);
}

const installer = path.join(releaseDir, base);
const digest = createHash("sha256").update(await readFile(installer)).digest("hex");
console.log(`Release set verified for ${pkg.version}`);
console.log(`${digest}  ${base}`);
