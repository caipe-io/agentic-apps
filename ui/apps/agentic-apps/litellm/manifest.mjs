import manifest from "./deploy/caipe/manifest.json" with { type: "json" };

export const LITELLM_APP_ID = manifest.id;
export const LITELLM_MANIFEST = manifest;
