import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = path.join(electronRoot, "runtime", "backend", "python.exe");
if (!existsSync(python)) throw new Error(`Embedded Python is missing: ${python}`);
const gtkBin = path.join(path.dirname(python), "gtk", "bin");
const desktopEnvironment = {
  ...process.env,
  API_AUTH_KEY: "",
  VIBE_TRADING_DESKTOP_FAST_START: "1",
  PYTHONUTF8: "1",
  PYTHONUNBUFFERED: "1",
  ...(existsSync(gtkBin) ? {
    PATH: `${gtkBin}${path.delimiter}${process.env.PATH ?? ""}`,
    WEASYPRINT_DLL_DIRECTORIES: gtkBin,
  } : {}),
};

verifyRuntimeFeatures();

const port = await freePort();
const key = randomBytes(24).toString("base64url");
const baseUrl = `http://127.0.0.1:${port}`;
const authHeaders = { Authorization: `Bearer ${key}` };
const output = [];
const started = performance.now();
const child = spawn(python, [
  "-c",
  "import api_server; raise SystemExit(api_server.serve_main())",
  "--host", "127.0.0.1",
  "--port", String(port),
], {
  cwd: path.dirname(python),
  windowsHide: true,
  env: { ...desktopEnvironment, API_AUTH_KEY: key },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => output.push(chunk.toString("utf8")));
}

const probes = [];
try {
  await waitUntilHealthy();
  const startupMs = Math.round(performance.now() - started);

  await expectResponse("frontend-root", "/", { expectedContentType: "text/html" });
  await expectResponse("frontend-deep-link", "/settings", { expectedContentType: "text/html" });
  await expectResponse("openapi", "/openapi.json", { expectedContentType: "application/json" });
  await expectResponse("swagger", "/docs", { expectedContentType: "text/html" });

  const indexHtml = await (await request("/")).text();
  const assets = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu)].map((match) => match[1]);
  for (const asset of new Set(assets)) await expectResponse(`asset:${asset}`, asset);

  const openApi = await (await request("/openapi.json")).json();
  const safeGetPaths = [];
  for (const [routePath, operations] of Object.entries(openApi.paths ?? {})) {
    const operation = operations.get;
    if (!operation || routePath.includes("{")) continue;
    const hasRequiredParameter = (operation.parameters ?? []).some((parameter) => parameter.required);
    if (!hasRequiredParameter) safeGetPaths.push(routePath);
  }

  for (const routePath of safeGetPaths.sort()) {
    const response = await request(routePath, { signal: AbortSignal.timeout(15_000) });
    const intentionallyNotReady = routePath === "/ready" && response.status === 503;
    if (response.status >= 500 && !intentionallyNotReady) {
      throw new Error(`GET ${routePath} returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    probes.push({ name: `GET ${routePath}`, status: response.status });
  }

  const ticketResponse = await request("/auth/sse-ticket", { method: "POST" });
  if (!ticketResponse.ok) throw new Error(`SSE ticket endpoint returned ${ticketResponse.status}`);
  const ticketPayload = await ticketResponse.json();
  if (typeof ticketPayload.ticket !== "string" || ticketPayload.ticket.length < 16) {
    throw new Error("SSE ticket endpoint did not return a usable one-time ticket.");
  }
  probes.push({ name: "POST /auth/sse-ticket", status: ticketResponse.status });

  const modelsResponse = await request("/settings/llm/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "deepseek",
      base_url: "https://api.deepseek.com/v1",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!modelsResponse.ok) {
    throw new Error(`Model discovery endpoint returned ${modelsResponse.status}: ${(await modelsResponse.text()).slice(0, 500)}`);
  }
  const modelsPayload = await modelsResponse.json();
  if (!Array.isArray(modelsPayload.models) || modelsPayload.models.length === 0) {
    throw new Error("Model discovery endpoint did not return a usable fallback model list.");
  }
  probes.push({ name: "POST /settings/llm/models", status: modelsResponse.status });

  console.log(JSON.stringify({
    status: "interfaces-ok",
    startupMs,
    openApiOperations: countOperations(openApi.paths ?? {}),
    parameterlessGetRoutes: safeGetPaths.length,
    frontendAssets: new Set(assets).size,
    probes,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(output.join("").slice(-12_000));
  process.exitCode = 1;
} finally {
  try {
    await fetch(`${baseUrl}/system/shutdown`, {
      method: "POST",
      headers: authHeaders,
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Fall through to the process-tree fallback below.
  }
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5_000)]);
  if (child.exitCode === null) child.kill();
}

async function waitUntilHealthy() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Backend exited early (${child.exitCode}).`);
    try {
      const response = await request("/health", { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Retry until uvicorn is accepting connections.
    }
    await delay(100);
  }
  throw new Error("Backend health check timed out.");
}

async function expectResponse(name, routePath, { expectedContentType } = {}) {
  const response = await request(routePath, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${name} returned ${response.status}`);
  if (expectedContentType && !response.headers.get("content-type")?.includes(expectedContentType)) {
    throw new Error(`${name} returned unexpected content type: ${response.headers.get("content-type")}`);
  }
  probes.push({ name, status: response.status });
  return response;
}

function request(routePath, options = {}) {
  return fetch(`${baseUrl}${routePath}`, {
    ...options,
    headers: { ...authHeaders, ...options.headers },
  });
}

function countOperations(paths) {
  const methods = new Set(["get", "put", "post", "delete", "patch", "options", "head"]);
  return Object.values(paths).reduce(
    (total, operations) => total + Object.keys(operations).filter((key) => methods.has(key)).length,
    0,
  );
}

function verifyRuntimeFeatures() {
  const source = [
    "import numpy, pandas, scipy, sklearn, numba, llvmlite",
    "import ccxt, yfinance, akshare, smartmoneyconcepts, duckdb, matplotlib",
    "import pypdfium2, openpyxl, docx, pptx",
    "from weasyprint import HTML",
    "assert len(HTML(string='<h1>Vibe-Trading PDF smoke</h1>').write_pdf()) > 1000",
  ].join("; ");
  const result = spawnSync(python, ["-c", source], {
    cwd: path.dirname(python),
    windowsHide: true,
    env: desktopEnvironment,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.status !== 0) {
    throw new Error(`Runtime feature imports failed.\n${result.stdout}\n${result.stderr}`);
  }
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
