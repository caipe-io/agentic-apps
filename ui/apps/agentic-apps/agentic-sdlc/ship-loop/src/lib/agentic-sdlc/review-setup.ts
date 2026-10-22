import { randomBytes, randomUUID } from "node:crypto";
import { Octokit } from "@octokit/rest";
import {
  getGitHubAccessToken,
  requireAgenticSdlcReader,
} from "./agentic-sdlc-auth";
import { getAgenticSdlcReposCollection } from "./mongo-collections";
import {
  managedReviewTask,
  platformRequest,
  reviewSetupAvailable,
  SetupError,
} from "./platform-client";
import {
  publicBinding,
  reviewBindings,
  sealReviewSecret,
  type ReviewBinding,
} from "./review-bindings";
import {
  CONFORMANCE_SKILL,
  REVIEW_TOOLS,
  reviewPrompt,
  reviewSystem,
} from "./review-policy";

export async function repositoryContext(
  req: Request,
  owner: string,
  repo: string,
  requireAdmin = false,
) {
  const reader = await requireAgenticSdlcReader(req);
  if (!reader) throw new SetupError("Sign in required.", 401);
  const client = new Octokit({
    auth: await getGitHubAccessToken(req),
    baseUrl: process.env.AGENTIC_SDLC_GITHUB_API_URL,
    request: { timeout: 15000 },
  });
  const { data: meta } = await client.repos.get({ owner, repo });
  if (requireAdmin && !meta.permissions?.admin)
    throw new SetupError(
      "Repository administrator access is required to enable or disable reviews.",
      403,
    );
  const registered = await (
    await getAgenticSdlcReposCollection()
  ).findOne({ repo_id: String(meta.id), offboarded_at: null });
  if (!registered) throw new SetupError("Connect this repository first.", 404);
  return { reader, client, meta, registered };
}

export async function configureRepositoryReviews(
  req: Request,
  owner: string,
  repo: string,
  enabled: boolean,
  teamSlug: string,
) {
  const { reader, client, meta } = await repositoryContext(
    req,
    owner,
    repo,
    true,
  );
  if (managedReviewTask(meta.full_name))
    throw new SetupError(
      "This repository already has a managed review task. Use Autonomous to manage it; a duplicate reviewer will not be created.",
      409,
    );
  const bindings = await reviewBindings();
  await bindings.createIndex({ repo_id: 1 }, { unique: true });
  const repoId = String(meta.id);
  let binding = await bindings.findOne({ repo_id: repoId });
  if (binding && binding.owner_sub !== reader.user.id)
    throw new SetupError(
      "A different user owns this repository's review connection. Ask that owner to manage it in Grid.",
      403,
    );
  if (!enabled) {
    if (!binding) return publicBinding(null, reader.user.id);
    // Stop future dispatch before attempting the remote task update.
    await bindings.updateOne(
      { repo_id: repoId, owner_sub: reader.user.id },
      {
        $set: { state: "disabled", updated_at: new Date() },
        $unset: { lease_token: "", lease_until: "" },
      },
    );
    if (binding.task_id) {
      const task = await platformRequest(
        req,
        `/api/autonomous/tasks/${encodeURIComponent(binding.task_id)}`,
      );
      if (task.owner_sub !== reader.user.id)
        throw new SetupError("Task ownership could not be verified.", 403);
      await platformRequest(
        req,
        `/api/autonomous/tasks/${encodeURIComponent(task.id)}`,
        "PUT",
        { ...task, enabled: false, trigger: { ...task.trigger, secret: null } },
      );
    }
    binding = await bindings.findOne({ repo_id: repoId });
    return publicBinding(binding, reader.user.id);
  }
  if (!reviewSetupAvailable())
    throw new SetupError(
      "Autonomous review setup is not configured for this environment.",
      503,
    );
  if (binding?.state === "enabled") {
    if (binding.full_name !== meta.full_name)
      throw new SetupError(
        "This repository was renamed. Disable reviews, then explicitly enable them for the new name.",
        409,
      );
    return publicBinding(binding, reader.user.id);
  }
  if (!teamSlug || !/^[a-zA-Z0-9._-]{1,192}$/.test(teamSlug))
    throw new SetupError("Choose an owner team for the review agent.");
  // All management calls go through the real caller's platform authorization.
  const [teamResult, modelResult] = await Promise.all([
    platformRequest(req, "/api/dynamic-agents/teams"),
    platformRequest(req, "/api/dynamic-agents/models"),
    platformRequest(req, "/api/autonomous/tasks"),
  ]);
  const team = (teamResult.data || []).find(
    (t: any) => t.slug === teamSlug && t.can_own_agents,
  );
  const model = (modelResult.data || []).find(
    (m: any) => m.model_id === process.env.AGENTIC_SDLC_REVIEW_MODEL_ID,
  );
  if (!team)
    throw new SetupError(
      "Your account cannot create an agent for the selected team.",
      403,
    );
  if (!model)
    throw new SetupError("The configured review model is unavailable.", 503);
  if (binding?.team_slug && binding.team_slug !== teamSlug)
    throw new SetupError(
      "Use this connection's original owner team, or manage the agent in Grid.",
      409,
    );
  const { data: githubUser } = await client.users.getAuthenticated();
  if (!binding) {
    const row: ReviewBinding = {
      repo_id: repoId,
      full_name: meta.full_name,
      owner_sub: reader.user.id,
      github_login: githubUser.login,
      binding_key: randomUUID(),
      state: "disabled",
      updated_at: new Date(),
    };
    try {
      await bindings.insertOne(row);
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    binding = await bindings.findOne({ repo_id: repoId });
  }
  if (!binding || binding.owner_sub !== reader.user.id)
    throw new SetupError(
      "A different user is configuring this repository.",
      409,
    );
  const lease = randomUUID();
  binding = await bindings.findOneAndUpdate(
    {
      repo_id: repoId,
      owner_sub: reader.user.id,
      state: { $ne: "enabled" },
      $or: [
        { lease_until: { $exists: false } },
        { lease_until: { $lt: new Date() } },
      ],
    },
    {
      $set: {
        state: "provisioning",
        lease_token: lease,
        lease_until: new Date(Date.now() + 5 * 60000),
        team_slug: teamSlug,
        full_name: meta.full_name,
        github_login: githubUser.login,
        updated_at: new Date(),
      },
      $unset: { last_error: "" },
    },
    { returnDocument: "after" },
  );
  if (!binding)
    throw new SetupError(
      "Review setup is already in progress. Wait for it to finish, then refresh.",
      409,
    );
  const save = async (fields: Partial<ReviewBinding>) => {
    const result = await bindings.updateOne(
      { repo_id: repoId, owner_sub: reader.user.id, lease_token: lease },
      {
        $set: {
          ...fields,
          lease_until: new Date(Date.now() + 5 * 60000),
          updated_at: new Date(),
        },
      },
    );
    if (!result.matchedCount)
      throw new SetupError("This connection changed during setup. Retry.", 409);
    Object.assign(binding!, fields);
  };
  try {
    if (!binding.skill_id) {
      const created = await platformRequest(
        req,
        "/api/skills/configs",
        "POST",
        {
          name: `SDLC PR conformance ${meta.full_name}`,
          description:
            "Evidence-backed security and documented code style review.",
          category: "GitHub Operations",
          visibility: "private",
          difficulty: "intermediate",
          is_quick_start: false,
          metadata: { version: "1.0.0", source: "agentic-sdlc" },
          tasks: [
            {
              display_text: "Check PR conformance",
              subagent: "github",
              llm_prompt: CONFORMANCE_SKILL,
            },
          ],
          skill_content: CONFORMANCE_SKILL,
        },
      );
      if (!created.data?.id)
        throw new SetupError(
          "Skill creation did not return an identifier.",
          502,
        );
      await save({ skill_id: created.data.id });
    }
    let skill = await platformRequest(
      req,
      `/api/skills/configs?id=${encodeURIComponent(binding.skill_id!)}`,
    );
    if (skill.scan_status === "unscanned") {
      await platformRequest(
        req,
        `/api/skills/configs/${encodeURIComponent(binding.skill_id!)}/scan`,
        "POST",
        {},
      );
      skill = await platformRequest(
        req,
        `/api/skills/configs?id=${encodeURIComponent(binding.skill_id!)}`,
      );
    }
    if (skill.scan_status !== "passed")
      throw new SetupError(
        "The conformance skill's security scan has not passed. Reviews remain off; ask your Grid administrator to inspect the skill scan.",
        409,
      );
    if (!binding.agent_id) {
      const name = `SDLC review ${meta.full_name} ${binding.binding_key}`;
      const expectedId = `agent-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`;
      let existing: any = null;
      try {
        existing = (
          await platformRequest(
            req,
            `/api/dynamic-agents/agents/${encodeURIComponent(expectedId)}`,
          )
        ).data;
      } catch (error) {
        if (!(error instanceof SetupError) || error.status !== 404) throw error;
      }
      if (
        existing &&
        (existing._id !== expectedId ||
          existing.owner_team_slug !== teamSlug ||
          !existing.description?.includes(binding.binding_key))
      )
        throw new SetupError("Agent scope could not be verified.", 409);
      const created = existing
        ? { data: existing }
        : await platformRequest(req, "/api/dynamic-agents", "POST", {
            name,
            description: `Repository-scoped COMMENT reviewer. App connection ${binding.binding_key}.`,
            system_prompt: reviewSystem(meta.full_name),
            model: {
              id: model.model_id,
              provider: model.provider || "openai",
              reasoning_effort: "medium",
            },
            allowed_tools: {
              [process.env.AGENTIC_SDLC_GITHUB_MCP_ID || "mcp-github"]:
                REVIEW_TOOLS,
            },
            visibility: "team",
            owner_team_slug: teamSlug,
            shared_with_teams: [],
            subagents: [],
            skills: [binding.skill_id],
            enabled: true,
          });
      if (!created.data?._id)
        throw new SetupError(
          "Agent creation did not return an identifier.",
          502,
        );
      await save({ agent_id: created.data._id });
    } else {
      // An explicit re-enable can repair a renamed repository's prompt without
      // changing tools, model or the owner team.
      await platformRequest(
        req,
        `/api/dynamic-agents?id=${encodeURIComponent(binding.agent_id)}`,
        "PUT",
        { system_prompt: reviewSystem(meta.full_name) },
      );
    }
    const bindingMarker = `[sdlc-binding:${binding.binding_key}]`;
    let task: any;
    if (binding.task_id)
      task = await platformRequest(
        req,
        `/api/autonomous/tasks/${encodeURIComponent(binding.task_id)}`,
      );
    else {
      const listed = await platformRequest(req, "/api/autonomous/tasks");
      const rows = Array.isArray(listed)
        ? listed
        : listed.items || listed.tasks || [];
      task = rows.find(
        (t: any) =>
          t.owner_sub === reader.user.id &&
          t.dynamic_agent_id === binding!.agent_id &&
          t.description?.includes(bindingMarker),
      );
      if (!task)
        task = await platformRequest(req, "/api/autonomous/tasks", "POST", {
          name: `SDLC PR review ${meta.full_name}`,
          description: `Opted-in COMMENT reviews and inline findings on new PR heads. ${bindingMarker}`,
          dynamic_agent_id: binding.agent_id,
          prompt: reviewPrompt(meta.full_name, "pending-task-id"),
          enabled: false,
          trigger: {
            type: "webhook",
            provider: "github",
            dedup_header: "X-GitHub-Delivery",
            filter: {
              conditions: [
                {
                  source: "payload",
                  field: "repository.full_name",
                  values: [meta.full_name],
                },
                {
                  source: "header",
                  field: "X-GitHub-Event",
                  values: ["pull_request"],
                },
                {
                  source: "payload",
                  field: "action",
                  values: ["opened", "synchronize"],
                },
              ],
            },
          },
          metadata: {
            source: "agentic-sdlc",
            sdlc_binding_key: binding.binding_key,
            repo_id: repoId,
            repository: meta.full_name,
          },
        });
      if (typeof task.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(task.id))
        throw new SetupError(
          "Task creation did not return a valid identifier.",
          502,
        );
      await save({ task_id: task.id });
    }
    if (
      task.owner_sub !== reader.user.id ||
      task.dynamic_agent_id !== binding.agent_id ||
      !task.description?.includes(bindingMarker)
    )
      throw new SetupError(
        "Task ownership or scope could not be verified.",
        403,
      );
    // Capture a high-entropy per-task signing key before activation. Retry can
    // recover an app-owned disabled task even if the initial POST response was lost.
    const secret = randomBytes(32).toString("base64url");
    await save({ secret: sealReviewSecret(secret, binding.binding_key) });
    const trigger = {
      ...task.trigger,
      secret,
      filter: {
        conditions: [
          {
            source: "payload",
            field: "repository.full_name",
            values: [meta.full_name],
          },
          {
            source: "header",
            field: "X-GitHub-Event",
            values: ["pull_request"],
          },
          {
            source: "payload",
            field: "action",
            values: ["opened", "synchronize"],
          },
        ],
      },
    };
    await platformRequest(
      req,
      `/api/autonomous/tasks/${encodeURIComponent(task.id)}`,
      "PUT",
      {
        ...task,
        metadata: {
          source: "agentic-sdlc",
          sdlc_binding_key: binding.binding_key,
          repo_id: repoId,
          repository: meta.full_name,
        },
        dynamic_agent_id: binding.agent_id,
        enabled: true,
        prompt: reviewPrompt(meta.full_name, task.id),
        trigger,
      },
    );
    const saved = await platformRequest(
      req,
      `/api/autonomous/tasks/${encodeURIComponent(task.id)}`,
    );
    if (
      !saved.enabled ||
      !saved.description?.includes(bindingMarker) ||
      saved.owner_sub !== reader.user.id ||
      saved.dynamic_agent_id !== binding.agent_id ||
      !saved.trigger?.has_secret ||
      saved.trigger.provider !== "github" ||
      saved.trigger.dedup_header?.toLowerCase() !== "x-github-delivery" ||
      !Array.isArray(saved.trigger.filter?.conditions) ||
      saved.trigger.filter.conditions.length !==
        trigger.filter.conditions.length ||
      !trigger.filter.conditions.every(
        (expected: { source: string; field: string; values: string[] }) =>
          saved.trigger.filter.conditions.some(
            (actual: any) =>
              actual.source === expected.source &&
              actual.field === expected.field &&
              JSON.stringify(actual.values) === JSON.stringify(expected.values),
          ),
      )
    )
      throw new SetupError(
        "Review task activation could not be verified.",
        502,
      );
    await save({ state: "enabled", enabled_at: new Date() });
    await bindings.updateOne(
      { repo_id: repoId, lease_token: lease },
      { $unset: { lease_token: "", lease_until: "" } },
    );
    return publicBinding(
      await bindings.findOne({ repo_id: repoId }),
      reader.user.id,
    );
  } catch (error) {
    await bindings.updateOne(
      { repo_id: repoId, lease_token: lease },
      {
        $set: {
          state: "error",
          last_error:
            error instanceof SetupError
              ? error.message
              : "Review setup could not finish. Reviews remain off; retry setup.",
          updated_at: new Date(),
        },
        $unset: { lease_token: "", lease_until: "" },
      },
    );
    throw error;
  }
}
