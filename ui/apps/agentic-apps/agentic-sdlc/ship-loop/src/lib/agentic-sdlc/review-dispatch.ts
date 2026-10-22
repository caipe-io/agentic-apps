import { createHmac } from "node:crypto";
import type { ObjectId } from "mongodb";
import { getAgenticSdlcEventsCollection } from "./mongo-collections";
import { managedReviewTask } from "./platform-client";
import { openReviewSecret, reviewBindings } from "./review-bindings";
import type { AgenticSdlcEvent } from "@/types/agentic-sdlc";

export async function prepareReviewDispatch(
  repoId: string,
  fullName: string,
  event: string,
  action: string | null,
  payload: Record<string, unknown>,
): Promise<AgenticSdlcEvent["review_dispatch"] | undefined> {
  if (
    event !== "pull_request" ||
    !["opened", "synchronize"].includes(action || "") ||
    managedReviewTask(fullName)
  )
    return;
  const pr = payload.pull_request as
    { state?: string; head?: { sha?: string } } | undefined;
  if (pr?.state !== "open" || !/^[a-f0-9]{40}$/.test(pr.head?.sha || ""))
    return;
  const binding = await (
    await reviewBindings()
  ).findOne({ repo_id: repoId, full_name: fullName, state: "enabled" });
  if (!binding?.task_id || !binding.secret) return;
  return {
    task_id: binding.task_id,
    state: "pending",
    attempts: 0,
    next_attempt_at: new Date(),
  };
}

let recovering = false;
export async function recoverReviewDispatches(): Promise<void> {
  if (recovering || !process.env.AGENTIC_SDLC_AUTONOMOUS_ORIGIN) return;
  recovering = true;
  try {
    const events = await getAgenticSdlcEventsCollection();
    // A process can die during its final attempt. Expose the uncertainty rather
    // than leaving an expired, unclaimable pending record forever.
    await events.updateMany(
      {
        "review_dispatch.state": "pending",
        "review_dispatch.attempts": { $gte: 8 },
        "review_dispatch.lease_until": { $lt: new Date() },
      },
      {
        $set: {
          "review_dispatch.state": "failed",
          "review_dispatch.last_status":
            "Delivery status uncertain after the retry limit; inspect Autonomous.",
        },
        $unset: { "review_dispatch.lease_until": "" },
      },
    );
    const rows = await events
      .find(
        {
          "review_dispatch.state": "pending",
          "review_dispatch.next_attempt_at": { $lte: new Date() },
          "review_dispatch.attempts": { $lt: 8 },
          $or: [
            { "review_dispatch.lease_until": { $exists: false } },
            { "review_dispatch.lease_until": { $lt: new Date() } },
          ],
        },
        { projection: { _id: 1 }, limit: 10, sort: { delivered_at: 1 } },
      )
      .toArray();
    for (const row of rows) await deliverReview(row._id);
  } finally {
    recovering = false;
  }
}

async function deliverReview(eventId: ObjectId) {
  const events = await getAgenticSdlcEventsCollection();
  const ev = await events.findOneAndUpdate(
    {
      _id: eventId,
      "review_dispatch.state": "pending",
      "review_dispatch.attempts": { $lt: 8 },
      $or: [
        { "review_dispatch.lease_until": { $exists: false } },
        { "review_dispatch.lease_until": { $lt: new Date() } },
      ],
    },
    {
      $set: { "review_dispatch.lease_until": new Date(Date.now() + 60000) },
      $inc: { "review_dispatch.attempts": 1 },
    },
    { returnDocument: "after" },
  );
  if (!ev?.review_dispatch) return;
  const finish = async (
    state: "accepted" | "skipped" | "failed",
    status?: string,
  ) =>
    events.updateOne(
      { _id: eventId },
      {
        $set: {
          "review_dispatch.state": state,
          ...(status ? { "review_dispatch.last_status": status } : {}),
        },
        $unset: { "review_dispatch.lease_until": "" },
      },
    );
  const bindings = await reviewBindings();
  const binding = await bindings.findOne({
    repo_id: ev.repo_id,
    task_id: ev.review_dispatch.task_id,
    state: "enabled",
  });
  if (
    !binding ||
    !binding.enabled_at ||
    ev.delivered_at < binding.enabled_at ||
    !ev.github_delivery_id
  ) {
    await finish("skipped");
    return;
  }
  try {
    const origin = new URL(process.env.AGENTIC_SDLC_AUTONOMOUS_ORIGIN!);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      !/^[a-zA-Z0-9_-]+$/.test(binding.task_id || "")
    )
      throw new Error("Configuration invalid");
    // Original GitHub bytes/signature were verified before storage. This trusted
    // bridge signs its own serialization with the task's separate secret, while
    // preserving the original delivery ID for the native durable deduplicator.
    const body = JSON.stringify(ev.payload);
    const signature = createHmac("sha256", openReviewSecret(binding))
      .update(body)
      .digest("hex");
    const result = await fetch(
      new URL(`/api/v1/hooks/${encodeURIComponent(binding.task_id!)}`, origin),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-GitHub-Event": "pull_request",
          "X-GitHub-Delivery": ev.github_delivery_id,
          "X-Hub-Signature-256": `sha256=${signature}`,
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!result.ok) {
      await result.body?.cancel();
      throw new Error(`HTTP ${result.status}`);
    }
    await result.body?.cancel();
    await finish("accepted");
    await bindings.updateOne(
      { repo_id: binding.repo_id, task_id: binding.task_id },
      {
        $set: {
          last_dispatch_at: new Date(),
          last_dispatch_status: "accepted",
        },
      },
    );
  } catch {
    const exhausted = ev.review_dispatch.attempts >= 8;
    await events.updateOne(
      { _id: eventId },
      {
        $set: {
          "review_dispatch.state": exhausted ? "failed" : "pending",
          "review_dispatch.last_status":
            "Task delivery failed; inspect Autonomous and the receiver health.",
          "review_dispatch.next_attempt_at": new Date(
            Date.now() +
              Math.min(300000, 5000 * 2 ** ev.review_dispatch.attempts),
          ),
        },
        $unset: { "review_dispatch.lease_until": "" },
      },
    );
    await bindings.updateOne(
      { repo_id: binding.repo_id, task_id: binding.task_id },
      {
        $set: {
          last_dispatch_at: new Date(),
          last_dispatch_status: exhausted ? "failed" : "retrying",
        },
      },
    );
  }
}
