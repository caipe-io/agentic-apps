import { spawn } from "node:child_process";

const apps = [
  ["finops", 3010, "ui/apps/agentic-apps/finops/server.mjs", "FINOPS_APP_PORT", "AGENTIC_APP_FINOPS_JWT_DISABLED"],
  ["weather", 3020, "ui/apps/agentic-apps/weather/server.mjs", "WEATHER_APP_PORT", "AGENTIC_APP_WEATHER_JWT_DISABLED"],
  ["agentic-sdlc", 3030, "ui/apps/agentic-apps/agentic-sdlc/server.mjs", "AGENTIC_SDLC_APP_PORT", "AGENTIC_APP_AGENTIC_SDLC_JWT_DISABLED"],
  ["litellm", 3042, "ui/apps/agentic-apps/litellm/server.mjs", "LITELLM_APP_PORT", "AGENTIC_APP_LITELLM_JWT_DISABLED"],
  ["oss-repo-management", 3040, "ui/apps/agentic-apps/oss-repo-management/server.mjs", "OSS_REPO_MANAGEMENT_APP_PORT", "AGENTIC_APP_OSS_REPO_MANAGEMENT_JWT_DISABLED"],
  ["jira-project-dashboard", 3041, "ui/apps/agentic-apps/jira-project-dashboard/server.mjs", "JIRA_PROJECT_DASHBOARD_APP_PORT", "AGENTIC_APP_JIRA_PROJECT_DASHBOARD_JWT_DISABLED"],
];

const children = [];
const failures = [];

try {
  for (const [name, port, command, portVariable, jwtVariable] of apps) {
    const child = spawn(process.execPath, [command], {
      env: { ...process.env, NODE_ENV: "test", [portVariable]: String(port), [jwtVariable]: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    children.push({ name, port, child, getOutput: () => output });
  }

  for (const entry of children) {
    let response;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        response = await fetch(`http://127.0.0.1:${entry.port}/healthz`);
        if (response.ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!response?.ok) {
      failures.push(`${entry.name}: /healthz did not become ready\n${entry.getOutput()}`);
      continue;
    }
    const page = await fetch(`http://127.0.0.1:${entry.port}/`);
    if (!page.ok) failures.push(`${entry.name}: / returned HTTP ${page.status}`);
    else console.log(`${entry.name}: health and root route passed`);
  }
} finally {
  for (const { child } of children) child.kill("SIGTERM");
}

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exitCode = 1;
}
