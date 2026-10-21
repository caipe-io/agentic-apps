export const config = {
  shipLoopEnabled: true,
  shipLoopAssistantEnabled: false,
};
export function getServerConfig() {
  return {
    ...config,
    shipLoopEnabled: process.env.SHIP_LOOP_ENABLED !== "false",
  };
}

export function getConfig(_key: "shipLoopResolvedArtifactLookbackHours") {
  return 24;
}
