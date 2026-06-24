import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const targets = ["src", "scripts"];
const errors = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (/\.(js|mjs|css|html|md)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

for (const target of targets) {
  const files = await walk(path.join(root, target));
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (/\t/.test(text)) errors.push(`${path.relative(root, file)} contains tabs`);
    if (/[ \t]+$/m.test(text)) errors.push(`${path.relative(root, file)} contains trailing whitespace`);
    if (!text.endsWith("\n")) errors.push(`${path.relative(root, file)} must end with newline`);
    if (/\.(js|mjs)$/.test(file)) {
      try {
        await execFileAsync(process.execPath, ["--check", file]);
      } catch (err) {
        const detail = err.stderr || err.message;
        errors.push(`${path.relative(root, file)} syntax error: ${String(detail).trim()}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("lint ok");
