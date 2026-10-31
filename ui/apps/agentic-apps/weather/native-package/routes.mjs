export const ROOT_PATH = "/weather";
export const DEFAULT_CITY = "San Jose";

export function cityFromPath(pathname) {
  const parts = String(pathname ?? "").split("/").filter(Boolean);
  if (parts[0] !== "weather" || parts.length !== 2) return "";
  try {
    const city = decodeURIComponent(parts[1]).trim();
    return validCity(city) ? city : "";
  } catch {
    return "";
  }
}

export function pathForCity(city) {
  const normalized = String(city ?? "").trim();
  if (!validCity(normalized)) return null;
  return `${ROOT_PATH}/${encodeURIComponent(normalized)}`;
}

function validCity(city) {
  return city.length > 0 && city.length <= 80 && !/[\\/\u0000-\u001f\u007f]/.test(city);
}
