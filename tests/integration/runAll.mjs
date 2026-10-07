import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const vaultRoot = resolve(pluginRoot, "../testVault_plugiGroups");
const runnerScript = "test:integration:all";

function integrationSuites() {
  const { scripts } = JSON.parse(readFileSync(resolve(pluginRoot, "package.json"), "utf8"));
  return Object.keys(scripts).filter(name => name.startsWith("test:") && name !== runnerScript);
}

function requireTestVault() {
  if (existsSync(vaultRoot)) return;
  console.error(`Test vault not found at ${vaultRoot}. From a worktree, link the vault next to the plugin folder.`);
  process.exit(1);
}

function vaultReachable() {
  return obsidianEval("app.vault.adapter.basePath") !== null;
}

function openVaultInObsidian() {
  const url = `obsidian://open?path=${encodeURIComponent(realpathSync(vaultRoot))}`;
  execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [url]);
}

async function waitForVault() {
  for (let attempt = 0; attempt < 40 && !vaultReachable(); attempt++) await setTimeout(500);
  return vaultReachable();
}

async function requireVaultOpenInObsidian() {
  if (vaultReachable()) return;
  openVaultInObsidian();
  if (await waitForVault()) return;
  console.error("Obsidian CLI cannot reach testVault_plugiGroups after opening it. Open the vault in Obsidian and run again.");
  process.exit(1);
}

function deployOnce() {
  execFileSync("npm", ["run", "-s", "deploy:test"], { cwd: pluginRoot, stdio: "inherit" });
}

function bringObsidianToFront() {
  if (process.platform === "darwin") execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
}

function runSuite(name) {
  bringObsidianToFront();
  const start = performance.now();
  const result = spawnSync("npm", ["run", "-s", name], {
    cwd: pluginRoot, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, PLUGIGROUPS_SKIP_DEPLOY: "1" },
  });
  return { name, passed: result.status === 0, seconds: (performance.now() - start) / 1000, output: `${result.stdout}${result.stderr}` };
}

function obsidianEval(code) {
  try {
    const output = execFileSync("obsidian", ["vault=testVault_plugiGroups", "eval", `code=${code}`], { encoding: "utf8", timeout: 10000 });
    return output.includes("=> ") ? output.slice(output.lastIndexOf("=> ") + 3).trim() : null;
  } catch {
    return null;
  }
}

function obsidianVisibility() {
  return obsidianEval("document.visibilityState") ?? "unknown";
}

function reportSuite(suite) {
  console.log(`${suite.passed ? "✔" : "✖"} ${suite.name.padEnd(28)} ${suite.seconds.toFixed(1).padStart(6)}s`);
}

function reportFailure(suite) {
  console.log(`\n${suite.output.trim()}\n`);
  const visibility = obsidianVisibility();
  if (visibility !== "visible") console.log(`Obsidian was ${visibility} after the failure; suites stall when its window is not on screen.`);
}

function runSuitesUntilFailure(names) {
  const suites = [];
  for (const name of names) {
    const suite = runSuite(name);
    suites.push(suite);
    reportSuite(suite);
    if (!suite.passed) return suites;
  }
  return suites;
}

requireTestVault();
await requireVaultOpenInObsidian();
const start = performance.now();
deployOnce();
const suites = runSuitesUntilFailure(integrationSuites());
const failed = suites.find(suite => !suite.passed);
if (failed) reportFailure(failed);
console.log(`${suites.filter(suite => suite.passed).length}/${integrationSuites().length} suites passed in ${((performance.now() - start) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
