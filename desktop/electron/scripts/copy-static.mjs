import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await cp(
  new URL("../src/loading.html", import.meta.url),
  new URL("../dist/loading.html", import.meta.url),
);
await cp(
  new URL("../.generated/release-config.json", import.meta.url),
  new URL("../dist/release-config.json", import.meta.url),
);
