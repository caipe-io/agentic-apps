/** GPU presence is independent from CPU architecture, including Graviton GPU hosts. */
export function ec2CpuCategory(row) {
  const architecture = String(row.architecture || "").toLowerCase();
  const manufacturer = String(row.cpuManufacturer || "").trim().toLowerCase();
  if (architecture.startsWith("x86") || architecture === "i386") return "x86";
  if (architecture.startsWith("arm")) {
    if (["aws", "amazon web services"].includes(manufacturer)) return "Graviton";
    return manufacturer ? "Other Arm" : "Arm · manufacturer unknown";
  }
  return architecture ? "Other architecture" : "Unknown architecture";
}
