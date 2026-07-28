import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const dist = resolve(root, "dist");
      const hostingSource = resolve(root, ".openai", "hosting.json");
      const workerSource = resolve(root, "worker", "index.js");
      const metadataDirectory = resolve(dist, ".openai");
      const serverDirectory = resolve(dist, "server");

      await rm(metadataDirectory, { recursive: true, force: true });
      await mkdir(metadataDirectory, { recursive: true });
      await mkdir(serverDirectory, { recursive: true });

      if (await exists(hostingSource)) {
        await cp(hostingSource, resolve(metadataDirectory, "hosting.json"));
      }
      await cp(workerSource, resolve(serverDirectory, "index.js"));
    },
  };
}
