import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadArtifact } from "@electron/get";

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPackage = JSON.parse(await readFile(path.join(electronRoot, "node_modules", "electron", "package.json"), "utf8"));
const checksums = JSON.parse(await readFile(path.join(electronRoot, "node_modules", "electron", "checksums.json"), "utf8"));
const version = electronPackage.version;
const archiveName = `electron-v${version}-win32-x64.zip`;
const expected = checksums[archiveName];
if (!expected) throw new Error(`Official checksum is missing for ${archiveName}`);

const targetDirectory = path.join(electronRoot, ".cache", "electron-dist");
const target = path.join(targetDirectory, archiveName);
await mkdir(targetDirectory, { recursive: true });

if (await sha256(target) !== expected) {
  const downloaded = await downloadArtifact({
    version,
    artifactName: "electron",
    platform: "win32",
    arch: "x64",
  });
  await copyFile(downloaded, target);
}

const actual = await sha256(target);
if (actual !== expected) throw new Error(`Electron checksum mismatch: expected ${expected}, got ${actual}`);
console.log(`Electron archive ready and verified: ${target}`);

async function sha256(file) {
  try {
    return createHash("sha256").update(await readFile(file)).digest("hex");
  } catch (error) {
    if (error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
