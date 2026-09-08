const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function parseAwsAccountList(value) {
  const seen = new Set();
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      const profile = (separator === -1 ? entry : entry.slice(0, separator)).trim();
      const accountId = (separator === -1 ? "" : entry.slice(separator + 1)).trim();
      return { profile, accountId };
    })
    .filter(({ profile }) => PROFILE_PATTERN.test(profile))
    .filter(({ profile }) => {
      if (seen.has(profile)) return false;
      seen.add(profile);
      return true;
    });
}

export function selectDefaultAwsProfile(accounts, configuredDefault = "") {
  const profiles = new Set(accounts.map((account) => account.profile));
  const requested = String(configuredDefault || "").trim();
  if (requested && profiles.has(requested)) return requested;
  return accounts.length === 1 ? accounts[0].profile : "";
}

export function resolveAwsProfile(accounts, requestedProfile, configuredDefault = "") {
  const requested = String(requestedProfile || "").trim();
  if (!accounts.length) return "";

  const profile = requested || selectDefaultAwsProfile(accounts, configuredDefault);
  if (!profile) {
    throw new Error("Select an AWS account before running the FinOps analysis.");
  }
  if (!accounts.some((account) => account.profile === profile)) {
    throw new Error("The selected AWS account is no longer available. Refresh the page and choose another account.");
  }
  return profile;
}

export function buildAwsCostExplorerPrompt({ dashboardKind, period, profile }) {
  const normalizedProfile = String(profile || "").trim();
  const profileInstruction = normalizedProfile
    ? `For aws_cli_execute: profile must be ${JSON.stringify(normalizedProfile)}, region must be us-east-2, output_format must be json, and jq_filter must be omitted.`
    : "For aws_cli_execute: profile must be an empty string, region must be us-east-2, output_format must be json, and jq_filter must be omitted.";
  return [
    `Build the ${dashboardKind} FinOps dashboard using AWS Cost Explorer for ${period.label} (${period.start} through ${period.end}).`,
    "Do not call request_user_input or ask follow-up questions; this embedded dashboard request already includes the AWS account, date range, output shape, and target dashboard.",
    "Use aws_cli_execute exactly once for the primary cost pull.",
    profileInstruction,
    "The command must not include the aws prefix, --profile, --region, --output, shell pipes, jq, file:// filters, or forecast calls.",
    `Use this command shape only: ce get-cost-and-usage --time-period Start=${period.start},End=${exclusiveEndDate(period.end)} --granularity DAILY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE Type=DIMENSION,Key=LINKED_ACCOUNT.`,
    "Use submit_structured_response with the requested finops.dashboard.v1 schema before the final explanation.",
    "Include trend as daily total cost points and rawCost as raw Cost Explorer rows grouped by date, service, and account when available.",
    "Set dataSource to aws-cost-explorer.",
    "Set forecastCost to totalCost if a forecast cannot be derived from the returned data without another tool call.",
    "Do not invent values. If AWS Cost Explorer is unavailable, explain what credential or permission is missing.",
  ].join(" ");
}

function exclusiveEndDate(endDate) {
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) throw new Error("A valid report end date is required.");
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}
