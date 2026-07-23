import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(electronRoot, "runtime", "backend", "python.exe");
if (!existsSync(python)) throw new Error(`Embedded Python is missing: ${python}`);
const gtkBin = path.join(path.dirname(python), "gtk", "bin");

const port = await freePort();
const key = randomBytes(24).toString("base64url");
const started = performance.now();
const output = [];
const child = spawn(python, [
  "-c",
  "import api_server; raise SystemExit(api_server.serve_main())",
  "--host", "127.0.0.1",
  "--port", String(port),
], {
  cwd: path.dirname(python),
  windowsHide: true,
  env: {
    ...process.env,
    API_AUTH_KEY: key,
    VIBE_TRADING_DESKTOP_FAST_START: "1",
    PYTHONUTF8: "1",
    PYTHONUNBUFFERED: "1",
    ...(existsSync(gtkBin) ? {
      PATH: `${gtkBin}${path.delimiter}${process.env.PATH ?? ""}`,
      WEASYPRINT_DLL_DIRECTORIES: gtkBin,
    } : {}),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => output.push(chunk.toString("utf8")));
}

try {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Backend exited early (${child.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const startupMs = Math.round(performance.now() - started);
        console.log(JSON.stringify({ status: "healthy", port, startupMs }));
        await fetch(`http://127.0.0.1:${port}/system/shutdown`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(2_000),
        });
        await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5_000)]);
        if (child.exitCode === null) child.kill();
        process.exit(0);
      }
    } catch {
      // Retry while the server imports its dependency graph.
    }
    await delay(250);
  }
  throw new Error("Backend health check timed out.");
} catch (error) {
  if (child.exitCode === null) child.kill();
  console.error(error instanceof Error ? error.message : String(error));
  console.error(output.join("").slice(-8_000));
  process.exit(1);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("No TCP port allocated."));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
