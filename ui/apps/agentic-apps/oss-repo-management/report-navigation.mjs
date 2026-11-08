/** Bookmark exact browser snapshots without substituting a newer live report. */
export function createOssReportNavigation({ host = window, appPath, initialRepo = "", getRuns, onLive, onSnapshot, onUnavailable }, createNavigation) {
  function selection(search) {
    const params = new URLSearchParams(search);
    const repo = (params.get("repo") ?? initialRepo).trim();
    const report = params.get("report") || "";
    const staleDays = Number(params.get("staleDays") || "30");
    if (repo.length > 200 || (repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) || report.length > 512 || !Number.isInteger(staleDays) || staleDays < 1 || staleDays > 365) return null;
    return { repo, report, staleDays };
  }
  function restore(search) {
    const query = selection(search);
    if (!query) { onUnavailable("This report link contains an invalid repository or stale-issue threshold."); return; }
    if (!query.report) { onLive(query.repo, query.staleDays); return; }
    const run = getRuns().find(item => item?.dashboard && (query.report === "latest" || item.id === query.report) && (!query.repo || item.dashboard.repo?.toLowerCase() === query.repo.toLowerCase()));
    if (!run) { onUnavailable("This saved report is unavailable in this browser. Saved snapshots stay in the browser where they were generated. Generate a report to load current data.", query.repo); return; }
    const staleDays = Number.isInteger(run.staleDays) && run.staleDays >= 1 && run.staleDays <= 365 ? run.staleDays : query.staleDays;
    onSnapshot(run, staleDays);
  }
  const navigation = createNavigation({ host, appId: "oss-repo-management", appPath, restore });
  function commit(repo, staleDays, report, mode) {
    const params = new URLSearchParams(host.location.search);
    if (repo) params.set("repo", repo); else params.delete("repo");
    if (staleDays !== 30) params.set("staleDays", String(staleDays)); else params.delete("staleDays");
    if (report) params.set("report", report); else params.delete("report");
    navigation.commit(params.toString(), mode);
  }
  return {
    initialize: () => restore(host.location.search),
    live: (repo, staleDays) => commit(repo, staleDays, "", "push"),
    remember: (run, staleDays) => commit(run.dashboard.repo, staleDays, run.id, "replace"),
    select(id) {
      const run = getRuns().find(item => item?.id === id && item.dashboard);
      if (!run) return;
      const staleDays = run.staleDays || selection(host.location.search)?.staleDays || 30;
      commit(run.dashboard.repo, staleDays, run.id, "push");
      onSnapshot(run, staleDays);
    },
    dispose: () => navigation.dispose(),
  };
}
