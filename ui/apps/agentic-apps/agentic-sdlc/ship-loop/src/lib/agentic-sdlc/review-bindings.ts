import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { getCollection } from "@/lib/mongodb";
import { SetupError } from "./platform-client";
export type ReviewBinding = {
  repo_id: string;
  full_name: string;
  owner_sub: string;
  github_login: string;
  binding_key: string;
  state: "provisioning" | "enabled" | "disabled" | "error";
  team_slug?: string;
  agent_id?: string;
  skill_id?: string;
  task_id?: string;
  secret?: { iv: string; tag: string; data: string };
  enabled_at?: Date;
  lease_until?: Date;
  lease_token?: string;
  updated_at: Date;
  last_error?: string;
  last_dispatch_at?: Date;
  last_dispatch_status?: string;
};
export async function reviewBindings() {
  return getCollection<ReviewBinding>("sdlc_review_bindings");
}
function key() {
  const master = process.env.GITHUB_WEBHOOK_SECRET;
  if (!master) throw new SetupError("Review signing is not configured.", 503);
  return Buffer.from(
    hkdfSync(
      "sha256",
      master,
      "sdlc-review-binding-v1",
      "task-secret-encryption",
      32,
    ),
  );
}
export function sealReviewSecret(
  value: string,
  bindingKey: string,
): NonNullable<ReviewBinding["secret"]> {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(bindingKey));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function openReviewSecret(binding: ReviewBinding): string {
  if (!binding.secret) throw new Error("Review signing unavailable");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(binding.secret.iv, "base64"),
  );
  cipher.setAAD(Buffer.from(binding.binding_key));
  cipher.setAuthTag(Buffer.from(binding.secret.tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(binding.secret.data, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
export function publicBinding(b: ReviewBinding | null, ownerSub: string) {
  return b
    ? {
        state: b.state,
        task_id: b.task_id || null,
        team_slug: b.team_slug || null,
        agent_id: b.agent_id || null,
        can_manage: b.owner_sub === ownerSub,
        last_error: b.last_error || null,
        last_dispatch_at: b.last_dispatch_at || null,
        last_dispatch_status: b.last_dispatch_status || null,
      }
    : { state: "disabled", can_manage: true };
}
