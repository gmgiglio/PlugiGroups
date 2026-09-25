import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vaultConfigDir = resolve(pluginDir, "..", "test_vault", ".obsidian");
const manifest = JSON.parse(await readFile(join(pluginDir, "manifest.json"), "utf8"));
const destination = join(vaultConfigDir, "plugins", manifest.id);

await access(vaultConfigDir);
await mkdir(destination, { recursive: true });
await Promise.all(
  ["main.js", "manifest.json", "styles.css"].map((file) =>
    copyFile(join(pluginDir, file), join(destination, file)),
  ),
);

console.log(`Installed ${manifest.name} in ${destination}`);
