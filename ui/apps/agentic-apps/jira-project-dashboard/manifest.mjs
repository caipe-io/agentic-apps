import manifest from "./deploy/caipe/manifest.json" with { type: "json" };

export const JIRA_PROJECT_DASHBOARD_APP_ID = manifest.id;
export const JIRA_PROJECT_DASHBOARD_MANIFEST = manifest;
