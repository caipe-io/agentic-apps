import { repositoryContext } from "./review-setup";
import { reviewBindings } from "./review-bindings";
import { platformRequest, SetupError } from "./platform-client";

export async function manualReviewContext(
  req: Request,
  owner: string,
  repo: string,
) {
  const { client, meta } = await repositoryContext(req, owner, repo);
  const binding = await (
    await reviewBindings()
  ).findOne({ repo_id: String(meta.id) });
  if (
    !binding ||
    binding.state !== "enabled" ||
    !binding.task_id ||
    !binding.agent_id ||
    binding.full_name.toLowerCase() !== meta.full_name.toLowerCase()
  )
    throw new SetupError(
      "Enable repository reviews in Connection & agent first.",
      409,
    );
  const path = `/api/autonomous/tasks/${encodeURIComponent(binding.task_id)}`;
  // The host checks the original caller's Autonomous entitlement and task ownership.
  const task = await platformRequest(req, path);
  if (
    !task.enabled ||
    task.dynamic_agent_id !== binding.agent_id ||
    task.owner_sub !== binding.owner_sub ||
    !task.description?.includes(`[sdlc-binding:${binding.binding_key}]`)
  )
    throw new SetupError(
      "The configured reviewer is disabled or its scope changed.",
      409,
    );
  if (task.manual_run_context_version !== 1)
    throw new SetupError(
      "Upgrade the Autonomous service to enable UI re-review.",
      409,
    );
  if (!task.prompt?.includes("<!-- caipe-pr-manual-review-policy:v1 -->"))
    throw new SetupError(
      "Update the saved reviewer's manual-review policy before using Re-review.",
      409,
    );
  return { client, meta, path };
}

export async function requestManualReview(
  req: Request,
  owner: string,
  repo: string,
  number: number,
  body: unknown,
) {
  const input = body as { head_sha?: string; request_id?: string } | null;
  if (
    !input ||
    !/^[a-f0-9]{40}$/.test(input.head_sha || "") ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      input.request_id || "",
    )
  )
    throw new SetupError(
      "A current commit and request identifier are required.",
    );
  const { client, meta, path } = await manualReviewContext(req, owner, repo);
  const { data: pr } = await client.pulls.get({
    owner,
    repo,
    pull_number: number,
  });
  if (
    pr.state !== "open" ||
    pr.draft ||
    pr.merged ||
    pr.head.sha !== input.head_sha ||
    pr.base.repo.id !== meta.id
  )
    throw new SetupError(
      "This PR changed or is no longer eligible. Refresh before requesting a review.",
      409,
    );
  const result = await platformRequest(req, `${path}/run`, "POST", {
    request_id: input.request_id,
    context: {
      manual_review: true,
      repository: { id: meta.id, full_name: meta.full_name },
      pull_request: {
        number: pr.number,
        html_url: pr.html_url,
        head: { sha: pr.head.sha },
        draft: false,
        state: "open",
      },
    },
  });
  if (typeof result?.run_id !== "string")
    throw new SetupError(
      "The service did not return a review run. Retry with the same request.",
      502,
    );
  return { run_id: result.run_id, head_sha: pr.head.sha, status: "accepted" };
}
