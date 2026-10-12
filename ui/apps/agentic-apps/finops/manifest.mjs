import manifest from "./deploy/caipe/manifest.json" with { type: "json" };

export const FINOPS_APP_ID = manifest.id;
export const FINOPS_MANIFEST = manifest;
