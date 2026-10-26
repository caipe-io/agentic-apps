import { readFileSync, statSync } from "node:fs";
import { infrastructureSourceConfiguration } from "./infrastructure-sources.mjs";

export function readInfrastructureSourceConfiguration(env = process.env) {
  let text = env.INFRA_SOURCE_CONFIG || "{}";
  if (env.INFRA_SOURCE_CONFIG_FILE) {
    if (statSync(env.INFRA_SOURCE_CONFIG_FILE).size > 65536) throw new Error("Infrastructure source configuration exceeds 64 KiB.");
    text = readFileSync(env.INFRA_SOURCE_CONFIG_FILE, "utf8");
  }
  if (Buffer.byteLength(text) > 65536) throw new Error("Infrastructure source configuration exceeds 64 KiB.");
  return infrastructureSourceConfiguration(JSON.parse(text));
}
