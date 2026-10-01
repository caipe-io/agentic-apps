export const ROOT_PATH = "/sdlc";

export function repositoryFromPath(pathname) {
  const parts = String(pathname ?? "").split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "sdlc") return "";
  try {
    const owner = decodeURIComponent(parts[1]);
    const repo = decodeURIComponent(parts[2]);
    if (!validPart(owner) || !validPart(repo)) return "";
    return `${owner}/${repo}`;
  } catch {
    return "";
  }
}

export function pathForRepository(repository) {
  const parts = String(repository ?? "").trim().split("/");
  if (parts.length !== 2 || parts.some((part) => !validPart(part))) return null;
  return `${ROOT_PATH}/${parts.map(encodeURIComponent).join("/")}`;
}

function validPart(value) {
  return /^[A-Za-z0-9_.-]+$/.test(value) && value !== "." && value !== "..";
}
