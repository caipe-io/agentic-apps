import { repositoryContext } from "./review-setup";
import { reviewBindings } from "./review-bindings";
import { SetupError } from "./platform-client";

export async function prepareManualReview(
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
  const { client, meta } = await repositoryContext(req, owner, repo);
  const binding = await (
    await reviewBindings()
  ).findOne({ repo_id: String(meta.id) });
  if (
    !binding ||
    binding.state !== "enabled" ||
    !binding.task_id ||
    !binding.agent_id ||
    !/^[a-zA-Z0-9_-]+$/.test(binding.task_id) ||
    binding.full_name.toLowerCase() !== meta.full_name.toLowerCase()
  )
    throw new SetupError(
      "Enable repository reviews in Connection & agent first.",
      409,
    );
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
  // This route only prepares public identifiers and a verified PR snapshot.
  // The host authorizes task access/run using the caller's browser session.
  return {
    task_id: binding.task_id,
    agent_id: binding.agent_id,
    owner_sub: binding.owner_sub,
    binding_key: binding.binding_key,
    run_body: {
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
    },
  };
}
