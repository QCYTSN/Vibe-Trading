import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
const generated = path.join(root, ".generated");
await mkdir(generated, { recursive: true });

const repository = String(process.env.VIBE_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || "").trim();
const match = repository.match(/^([^/\s]+)\/([^/\s]+)$/u);
const release = match
  ? { enabled: true, provider: "github", owner: match[1], repo: match[2] }
  : { enabled: false, provider: "github", owner: "", repo: "" };

const build = structuredClone(pkg.build);
if (build.nsis) delete build.nsis.differentialPackage;
if (release.enabled) {
  build.publish = [{ provider: "github", owner: release.owner, repo: release.repo }];
}

await writeFile(path.join(generated, "electron-builder.json"), `${JSON.stringify(build, null, 2)}\n`, "utf8");
await writeFile(path.join(generated, "release-config.json"), `${JSON.stringify(release, null, 2)}\n`, "utf8");
console.log(release.enabled
  ? `Release target configured: ${release.owner}/${release.repo}`
  : "Release target is not configured; update checks will remain unavailable for local builds.");
