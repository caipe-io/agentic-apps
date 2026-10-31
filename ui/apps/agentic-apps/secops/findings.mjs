/** Snapshot signals only: security groups and public IPs do not prove network reachability. */
export function exposureSignals(instances, groups) {
  const byId = new Map(groups.map((group) => [group.GroupId, group]));
  const rows = [];
  for (const instance of instances) {
    if (instance.State?.Name === "terminated") continue;
    const tags = Object.fromEntries((instance.Tags || []).map((tag) => [String(tag.Key || "").toLowerCase(), tag.Value || ""]));
    const dev = [tags.environment, tags.env, tags.stage, tags.name].some((value) => /(?:^|[^a-z0-9])(dev|development|test|staging|sandbox|nonprod)(?:$|[^a-z0-9])/i.test(value || ""));
    const interfaces = instance.NetworkInterfaces?.length ? instance.NetworkInterfaces : [{ Association: { PublicIp: instance.PublicIpAddress }, Groups: instance.SecurityGroups }];
    for (const nic of interfaces) {
      const ipv4 = Boolean(nic.Association?.PublicIp);
      const ipv6 = Boolean(nic.Ipv6Addresses?.length);
      if (!ipv4 && !ipv6) continue;
      if (!Array.isArray(nic.Groups) || !nic.Groups.length) throw new Error("Public interface security groups are unavailable.");
      for (const attachment of nic.Groups) {
        const group = byId.get(attachment.GroupId);
        if (!group) throw new Error("A security group attached to an instance was unavailable; exposure coverage is incomplete.");
        for (const rule of group.IpPermissions || []) {
          const sources = [];
          if (ipv4 && rule.IpRanges?.some((range) => range.CidrIp === "0.0.0.0/0")) sources.push("0.0.0.0/0");
          if (ipv6 && rule.Ipv6Ranges?.some((range) => range.CidrIpv6 === "::/0")) sources.push("::/0");
          if (!sources.length) continue;
          const protocol = String(rule.IpProtocol || "").toLowerCase();
          const tcp = ["tcp", "6", "-1"].includes(protocol);
          const ssh = tcp && (protocol === "-1" || (rule.FromPort <= 22 && rule.ToPort >= 22));
          if (!ssh && !dev) continue;
          rows.push({ kind: ssh ? "public_ssh_candidate" : "public_dev_ingress_candidate", instanceId: instance.InstanceId, interfaceId: nic.NetworkInterfaceId || null, name: tags.name || instance.InstanceId, state: instance.State?.Name || "unknown", groupId: group.GroupId, protocol, ports: protocol === "-1" ? "all" : `${rule.FromPort ?? "?"}–${rule.ToPort ?? "?"}`, sources, devTagged: dev });
        }
      }
    }
  }
  return rows;
}

/** Last observed use covers IAM console password and access keys only. */
export function iamUserRows(users, keyDetails, now = Date.now()) {
  const cutoff = now - 180 * 86400000;
  const date = (value) => { const parsed = value ? new Date(value) : null; return parsed && Number.isFinite(parsed.getTime()) ? parsed : null; };
  return users.map((user) => {
    const created = date(user.CreateDate); const passwordUsed = date(user.PasswordLastUsed);
    const details = keyDetails.get(user.UserName); const keys = details?.keys || [];
    const uses = [passwordUsed, ...keys.map((key) => date(key.lastUsed))].filter(Boolean);
    const latest = uses.length ? new Date(Math.max(...uses.map((value) => value.getTime()))) : null;
    const oldestKey = keys.map((key) => date(key.createdAt)).filter(Boolean).sort((a, b) => a - b)[0] || null;
    return { name: user.UserName, createdAt: created?.toISOString() || null, ageDays: created ? Math.max(0, Math.floor((now - created.getTime()) / 86400000)) : null, olderThan180Days: created ? created.getTime() < cutoff : null, lastObservedUse: latest?.toISOString() || null, lastObservedUseOlder180Days: !details?.complete || !latest || keys.some((key) => !date(key.lastUsed)) ? null : latest.getTime() < cutoff, oldestKeyCreatedAt: oldestKey?.toISOString() || null, accessKeyOlder180Days: !details?.complete || keys.some((key) => !date(key.createdAt)) ? null : oldestKey ? oldestKey.getTime() < cutoff : false, accessKeyCount: details?.complete ? keys.length : null, keyCoverage: details?.complete ? "complete" : "unavailable" };
  });
}

export function githubControlSummary(repo, branch, rules, protection) {
  const active = new Set(rules.map((rule) => rule.type));
  const classic = protection?.state === "available" ? protection.data : null;
  const securitySetting = (name) => repo.security_and_analysis?.[name]?.status === "enabled" ? "present" : repo.security_and_analysis?.[name]?.status === "disabled" ? "not_detected" : "unknown";
  const checks = {
    secretScanning: securitySetting("secret_scanning"),
    pushProtection: securitySetting("secret_scanning_push_protection"),
    branchProtection: branch?.protected === true || active.size > 0 ? "present" : branch?.protected === false && protection?.state === "absent" ? "not_detected" : "unknown",
    pullRequests: active.has("pull_request") || Boolean(classic?.required_pull_request_reviews) ? "present" : ["available", "absent"].includes(protection?.state) ? "not_detected" : "unknown",
    requiredChecks: active.has("required_status_checks") || Boolean(classic?.required_status_checks) ? "present" : ["available", "absent"].includes(protection?.state) ? "not_detected" : "unknown",
  };
  return { repository: repo.full_name, private: repo.private, defaultBranch: repo.default_branch, checks, activeRuleTypes: [...active].sort(), limitation: "Ruleset bypass permissions and individual enforcement details are not assessed." };
}
