import { githubControlSummary } from "./findings.mjs";

export function createGithubScanner({ repos, token, apiBase = "https://api.github.com", request = fetch }) {
  const base = new URL(apiBase);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) throw new Error("GitHub API must use HTTPS.");
  return async function scan(repo) {
    if (!repos.includes(repo)) throw new Error("Choose a configured repository.");
    if (!token) return { status: "unavailable", error: "GitHub credentials are not configured.", data: null };
    const root = `${base.toString().replace(/\/$/, "")}/repos/${repo.split("/").map(encodeURIComponent).join("/")}`;
    async function get(path) {
      const response = await request(root + path, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "secops-dashboard" }, signal: AbortSignal.timeout(15000), redirect: "error" });
      if (!response.ok) return { ok: false, status: response.status };
      return { ok: true, data: await response.json() };
    }
    try {
      const metadata = await get("");
      if (!metadata.ok || !metadata.data?.default_branch) return { status: "unavailable", error: "Repository metadata unavailable or access denied.", data: null };
      const branchPath = encodeURIComponent(metadata.data.default_branch);
      const [branch, classic] = await Promise.all([get(`/branches/${branchPath}`), get(`/branches/${branchPath}/protection`)]);
      const rules = []; let complete = false;
      for (let page = 1; page <= 100; page += 1) {
        const response = await get(`/rules/branches/${branchPath}?per_page=100&page=${page}`);
        if (!response.ok || !Array.isArray(response.data)) break;
        rules.push(...response.data);
        if (response.data.length < 100) { complete = true; break; }
      }
      const classicState = classic.ok ? { state: "available", data: classic.data } : classic.status === 404 && branch.ok && branch.data.protected === false && complete && !rules.length ? { state: "absent" } : { state: "unavailable" };
      const data = githubControlSummary(metadata.data, branch.ok ? branch.data : null, rules, classicState);
      if (!complete) { data.checks = Object.fromEntries(Object.keys(data.checks).map((name) => [name, ["secretScanning", "pushProtection"].includes(name) || data.checks[name] === "present" ? data.checks[name] : "unknown"])); data.limitation += " Applicable rules could not be completely read."; }
      if (!branch.ok || classicState.state === "unavailable") data.limitation += " Some protection details are unavailable or access was denied.";
      if (data.checks.secretScanning === "unknown" || data.checks.pushProtection === "unknown") data.limitation += " Some security settings were not returned.";
      return { status: complete && branch.ok && classicState.state !== "unavailable" && data.checks.secretScanning !== "unknown" && data.checks.pushProtection !== "unknown" ? "ready" : "partial", data };
    } catch { return { status: "unavailable", error: "GitHub request failed or timed out.", data: null }; }
  };
}
