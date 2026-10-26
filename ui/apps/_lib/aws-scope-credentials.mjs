/** Resolve workload identity once and assume only deployment-configured account roles. */
export function createAwsScopeCredentials(configuration, providers, { sessionName, region, env = process.env }) {
  const roleArn = env.AWS_ROLE_ARN;
  const tokenFile = env.AWS_WEB_IDENTITY_TOKEN_FILE;
  if (Boolean(roleArn) !== Boolean(tokenFile)) throw new Error("Configure both the IRSA role ARN and web-identity token file.");
  const base = roleArn ? providers.fromTokenFile({ roleArn, webIdentityTokenFile: tokenFile, clientConfig: { region: env.AWS_REGION || region } }) : providers.fromNodeProviderChain();
  const credentials = new Map();
  return (scope) => {
    const key = scope.accountId || scope.profile;
    if (!credentials.has(key)) credentials.set(key, scope.accountId ? providers.fromTemporaryCredentials({
      masterCredentials: base,
      clientConfig: { region: scope.region || region },
      params: { RoleArn: "arn:" + configuration.partition + ":iam::" + scope.accountId + ":role/" + configuration.crossAccountRoleName, RoleSessionName: sessionName },
    }) : base);
    return credentials.get(key);
  };
}
