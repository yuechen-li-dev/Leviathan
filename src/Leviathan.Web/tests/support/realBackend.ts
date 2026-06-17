import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";

export const realBackendPort = 5187;
export const realBackendBaseUrl = `http://127.0.0.1:${realBackendPort}`;

type RealBackendHandle = {
  apiBaseUrl: string;
  dataDir: string;
  stop: () => Promise<void>;
};

const currentFile = fileURLToPath(import.meta.url);
const supportDir = path.dirname(currentFile);
const webRoot = path.resolve(supportDir, "..", "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const serverProject = path.join(repoRoot, "src", "Leviathan.Server", "Leviathan.Server.csproj");

export async function startRealBackend(): Promise<RealBackendHandle> {
  const dataDir = path.join(webRoot, "test-results", "real-backend-data");
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  const logs: string[] = [];
  const child = spawn(
    "dotnet",
    ["run", "--project", serverProject, "--", "--urls", realBackendBaseUrl],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        LEVIATHAN_ALLOW_UNSAFE_ADMIN: "true",
        LEVIATHAN_DATA_DIR: dataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  child.stdout?.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr?.on("data", (chunk) => logs.push(String(chunk)));

  await waitForBackend(`${realBackendBaseUrl}/api/apps`, logs);

  return {
    apiBaseUrl: `${realBackendBaseUrl}/api`,
    dataDir,
    stop: () => stopProcess(child.pid),
  };
}

async function waitForBackend(url: string, logs: string[]) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until timeout.
    }
    await delay(1000);
  }

  throw new Error(`Real backend did not become ready at ${url}.\n\n${logs.join("")}`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopProcess(pid: number | undefined) {
  if (!pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      execFile("taskkill", ["/pid", String(pid), "/t", "/f"], () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Best effort cleanup only.
  }
}
