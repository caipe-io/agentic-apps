import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

async function collectMjs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectMjs(path)));
    else if (entry.isFile() && path.endsWith(".mjs")) files.push(path);
  }
  return files;
}

const files = await collectMjs("ui/apps");
for (const file of files) {
  await execFileAsync(process.execPath, ["--check", file]);
}
console.log(`Syntax checked ${files.length} JavaScript modules.`);
