import { createAwsScopeCredentials } from "../../_lib/aws-scope-credentials.mjs";

// Session permissions intersect with the target role, even if a shared role
// also supports separately authorized write workflows.
export const SECOPS_READ_ONLY_SESSION_POLICY = {
  Version: "2012-10-17",
  Statement: [{
    Effect: "Allow",
    Action: [
      "sts:GetCallerIdentity",
      "ec2:DescribeInstances", "ec2:DescribeSecurityGroups",
      "elasticloadbalancing:DescribeLoadBalancers", "elasticloadbalancing:DescribeTags",
      "iam:ListUsers", "iam:ListAccessKeys", "iam:GetAccessKeyLastUsed",
    ],
    Resource: "*",
  }],
};

export function createSecopsScopeCredentials(configuration, providers, { env = process.env } = {}) {
  return createAwsScopeCredentials(configuration, providers, {
    sessionName: "secops-dashboard",
    region: configuration.regions[0] || "us-east-1",
    env,
    sessionPolicy: SECOPS_READ_ONLY_SESSION_POLICY,
  });
}
