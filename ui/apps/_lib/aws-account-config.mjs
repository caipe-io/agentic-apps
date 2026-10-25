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

