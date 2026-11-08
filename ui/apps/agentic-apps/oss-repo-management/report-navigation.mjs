export const OSS_REPORT_SECTIONS = { overview: "overview", priorities: "actionsPanel", activity: "trendsPanel", community: "healthPanel" };

/** Resume browser snapshots while preserving explicit report links. */
export function createOssReportNavigation({ host = window, appPath, initialRepo = "", getRuns, onLive, onSnapshot, onUnavailable, onSection = () => {} }, createNavigation) {
  let currentDataSelection = null;
  const dataKey = query => JSON.stringify([query.repo, query.report, query.staleDays]);
  function selection(search) {
    const params = new URLSearchParams(search);
    const repo = (params.get("repo") ?? initialRepo).trim();
    const report = params.get("report") || "";
    const staleDays = Number(params.get("staleDays") || "30");
    if (repo.length > 200 || (repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) || report.length > 512 || !Number.isInteger(staleDays) || staleDays < 1 || staleDays > 365) return null;
    const tab = params.get("tab");
    return { repo, report, staleDays, tab: Object.hasOwn(OSS_REPORT_SECTIONS, tab) ? tab : "overview" };
  }
  function restore(search) {
    // Old section bookmarks still work, without allowing browser anchor scrolling.
    const legacy = Object.entries(OSS_REPORT_SECTIONS).find(([, id]) => host.location.hash === "#" + id)?.[0];
    if (legacy) {
      const params = new URLSearchParams(search);
      if (!params.has("tab")) params.set("tab", legacy);
      host.history.replaceState(null, "", host.location.pathname + host.location.search);
      search = params.toString();
      navigation.commit(search, "replace");
    }
    let query = selection(search);
    if (!query) { onUnavailable("This report link contains an invalid repository or stale-issue threshold."); return; }
    const params = new URLSearchParams(search);
    // A plain app visit resumes saved evidence; explicit data links keep their meaning.
    if (!["repo", "report", "staleDays"].some(key => params.has(key))) {
      for (const run of getRuns()) {
        if (typeof run?.id !== "string" || !run.id || typeof run?.dashboard?.repo !== "string") continue;
        params.set("repo", run.dashboard.repo);
        params.set("report", run.id);
        const staleDays = Number.isInteger(run.staleDays) && run.staleDays >= 1 && run.staleDays <= 365 ? run.staleDays : 30;
        if (staleDays !== 30) params.set("staleDays", String(staleDays)); else params.delete("staleDays");
        const saved = selection(params.toString());
        if (!saved?.repo) continue;
        query = saved;
        navigation.commit(params.toString(), "replace");
        break;
      }
    }
    onSection(query.tab);
    if (dataKey(query) === currentDataSelection) return;
    currentDataSelection = dataKey(query);
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
    currentDataSelection = dataKey({ repo, staleDays, report });
    navigation.commit(params.toString(), mode);
  }
  return {
    initialize: () => restore(host.location.search),
    live: (repo, staleDays) => commit(repo, staleDays, "", "push"),
    remember: (run, staleDays) => commit(run.dashboard.repo, staleDays, run.id, "replace"),
    section(tab) {
      if (!Object.hasOwn(OSS_REPORT_SECTIONS, tab)) return;
      const params = new URLSearchParams(host.location.search);
      if (tab === "overview") params.delete("tab"); else params.set("tab", tab);
      navigation.commit(params.toString(), "push");
      onSection(tab);
    },
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
