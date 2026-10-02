import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const vaultRoot = resolve(pluginRoot, "../testVault_plugiGroups");
const viewType = "plugin-groups-admin-view";
const fixtureId = `plugigroups-cli-test-${randomUUID().slice(0, 8)}`;
const fixtureRoot = join(vaultRoot, ".obsidian/plugins", fixtureId);
const dataPath = join(vaultRoot, ".obsidian/plugins/plugin-groups-admin/data.json");
const originalData = readFileSync(dataPath, "utf8");

function obsidian(command, ...args) {
  const parameters = ["vault=testVault_plugiGroups", command, ...args];
  const output = process.platform === "darwin"
    ? execFileSync("/usr/bin/script", ["-q", "/dev/null", "obsidian", ...parameters], { encoding: "utf8", timeout: 30000, stdio: ["inherit", "pipe", "pipe"] })
    : execFileSync("obsidian", parameters, { encoding: "utf8", timeout: 30000 });
  return output.replaceAll("\r", "").split("\n")
    .filter(line => !line.includes("Loading updated app package") && !line.startsWith("Your Obsidian installer is out of date.")).join("\n").trim();
}

function cli(action, params = {}) {
  const output = obsidian(`plugiGroups:${action}`, ...Object.entries(params).map(([key, value]) => `${key}=${value}`));
  assert.doesNotMatch(output, /^Error:/m, output);
  return output;
}

function json(action, params = {}) {
  return JSON.parse(cli(action, { ...params, format: "json" }));
}

function evaluate(expression) {
  const output = obsidian("eval", `code=JSON.stringify(${expression})`);
  assert.ok(output.includes("=> "), output);
  return JSON.parse(output.slice(output.lastIndexOf("=> ") + 3));
}

async function waitFor(expression) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (evaluate(expression)) return;
    await setTimeout(100);
  }
  assert.fail(`Timed out: ${expression}`);
}

function assertViewsContain(id, expected) {
  const result = evaluate(`globalThis.__plugiGroupsCliViews.every(leaf =>
    !!leaf.view.contentEl.querySelector('[data-group-id="${id}"]') === ${expected})`);
  assert.equal(result, true, "Both views must reflect CLI changes");
}

async function installFixtureAndOpenViews() {
  assert.equal(existsSync(fixtureRoot), false);
  mkdirSync(fixtureRoot);
  writeFileSync(join(fixtureRoot, "manifest.json"), JSON.stringify({ id: fixtureId, name: fixtureId, version: "1.0.0", minAppVersion: "1.0.0" }));
  writeFileSync(join(fixtureRoot, "main.js"), "module.exports = class extends require('obsidian').Plugin {};");
  evaluate(`(globalThis.__plugiGroupsCliReady = false, globalThis.__plugiGroupsCliViews = [],
    Promise.resolve(app.plugins.loadManifests()).then(async () => {
      for (let i = 0; i < 2; i++) {
        const leaf = app.workspace.getLeaf("tab");
        globalThis.__plugiGroupsCliViews.push(leaf);
        await leaf.setViewState({type: ${JSON.stringify(viewType)}, active: true});
      }
      globalThis.__plugiGroupsCliReady = true;
    }), true)`);
  await waitFor("globalThis.__plugiGroupsCliReady");
}

async function checkCommands() {
  const first = cli("create", { name: `CLI Writing ${fixtureId}` });
  const second = cli("create", { name: `CLI Research ${fixtureId}` });
  assertViewsContain(first, true);
  cli("rename", { group: first, name: `CLI Renamed ${fixtureId}` });
  assert.ok(json("list").some(group => group.id === first && group.name.startsWith("CLI Renamed")));
  cli("add", { group: first, plugin: fixtureId });
  cli("add", { group: first, plugin: "plugin-groups-admin" });
  cli("enable", { group: first });
  assert.equal(evaluate(`app.plugins.enabledPlugins.has(${JSON.stringify(fixtureId)})`), true);
  cli("disable", { group: first });
  assert.equal(evaluate(`app.plugins.enabledPlugins.has(${JSON.stringify(fixtureId)})`), false);
  assert.equal(evaluate('app.plugins.enabledPlugins.has("plugin-groups-admin")'), true);
  cli("setting:set", { key: "allowMultipleGroups", value: true });
  cli("add", { group: second, plugin: fixtureId });
  cli("move", { plugin: fixtureId, to: second });
  assert.ok(!json("show", { group: first }).pluginIds.includes(fixtureId));
  cli("remove", { group: second, plugin: fixtureId });
  assert.ok(json("ungrouped").some(plugin => plugin.id === fixtureId));
  cli("add", { group: second, plugin: fixtureId });
  cli("collapse", { group: second });
  assert.equal(json("show", { group: second }).collapsed, true);
  cli("expand", { group: second });
  cli("collapse", { all: true });
  cli("expand", { all: true });
  cli("setting:set", { key: "collapseMode", value: "individual" });
  cli("reorder", { group: "ungrouped", before: first });
  const ordered = json("list").map(group => group.id);
  assert.equal(ordered.indexOf("ungrouped") + 1, ordered.indexOf(first));
  assert.equal(json("search", { query: fixtureId }).length, 1);
  cli("move", { plugin: fixtureId, to: "ungrouped" });
  assert.equal(json("search", { query: fixtureId, ungrouped: true }).length, 1);
  cli("filter", { query: fixtureId });
  cli("filter", { query: "", scope: "ungrouped" });
  assert.equal(evaluate(`globalThis.__plugiGroupsCliViews.every(leaf => leaf.view.contentEl.querySelector(".plugin-groups-admin-search input").value === ${JSON.stringify(fixtureId)})`), true);
  cli("filter", { query: "" });
  cli("setting:set", { key: "showRibbonButton", value: false });
  assert.equal(evaluate('app.plugins.plugins["plugin-groups-admin"].ribbonButton === null'), true);
  cli("setting:set", { key: "showRibbonButton", value: true });
  cli("setting:set", { key: "confirmGroupDeletion", value: true });
  cli("setting:set", { key: "openLocation", value: "window" });
  assert.equal(JSON.parse(cli("settings", { key: "openLocation" })), "window");
  cli("delete", { group: first });
  assertViewsContain(first, false);
  return second;
}

function checkStructureReplacement(groupId) {
  const structure = json("structure");
  structure.groups.find(group => group.id === groupId).name = "CLI Bulk Updated";
  structure.groups.find(group => group.id === groupId).pluginIds.push("absent-plugin-preserved");
  const path = join(fixtureRoot, "structure.json");
  writeFileSync(path, JSON.stringify(structure));
  const preview = JSON.parse(cli("structure:set", { path, "dry-run": true }));
  assert.equal(preview.applied, false);
  assert.notEqual(json("show", { group: groupId }).name, "CLI Bulk Updated");
  const result = JSON.parse(cli("structure:set", { path: `.obsidian/plugins/${fixtureId}/structure.json` }));
  assert.equal(result.applied, true);
  assert.equal(json("show", { group: groupId }).name, "CLI Bulk Updated");
  assertViewsContain(groupId, true);
  const before = json("structure");
  assert.match(obsidian("plugiGroups:structure:set", `path=${path}`, "dryrun=true"), /Error: Unknown parameter: dryrun/);
  assert.match(obsidian("plugiGroups:structure:set", 'json={"version":1}'), /Error:/);
  assert.deepEqual(json("structure"), before);
  assert.match(obsidian("plugiGroups:reorder", `group=${groupId}`, "before=ungrouped", "after=ungrouped"), /Error:/);
  assert.deepEqual(json("structure"), before);
  obsidian("plugin:reload", "id=plugin-groups-admin");
  assert.deepEqual(json("structure"), before, "Bulk replacement must survive reload");
  assert.deepEqual(JSON.parse(readFileSync(dataPath, "utf8")).groups, before.groups.filter(group => group.id !== "ungrouped"));
  const roundTrip = JSON.parse(cli("structure:set", { json: JSON.stringify(before) }));
  assert.deepEqual(roundTrip.structure, before);
  assert.match(cli("structure"), /CLI Bulk Updated/);
}

function checkPermanentGroup(groupId) {
  const structure = json("structure");
  const permanent = structure.groups.find(group => group.id === "ungrouped");
  const others = permanent.pluginIds.filter(id => id !== fixtureId && id !== "plugin-groups-admin");
  structure.groups.push({ id: `${fixtureId}-holder`, name: `CLI Holder ${fixtureId}`, pluginIds: others });
  permanent.pluginIds = permanent.pluginIds.filter(id => !others.includes(id));
  cli("structure:set", { json: JSON.stringify(structure) });
  const beforeEnabled = evaluate('[...app.plugins.enabledPlugins].sort()');
  const name = "Ungrouped";
  const beforeRename = json("structure");
  assert.match(obsidian("plugiGroups:rename", "group=ungrouped", "name=Other plugins"), /cannot be renamed/);
  const renamed = { ...beforeRename, groups: beforeRename.groups.map(group => group.id === "ungrouped" ? { ...group, name: "Other plugins" } : group) };
  assert.match(obsidian("plugiGroups:structure:set", `json=${JSON.stringify(renamed)}`), /cannot be renamed/);
  assert.deepEqual(json("structure"), beforeRename);
  assert.equal(json("show", { group: name }).permanent, true);
  assert.equal(evaluate(`globalThis.__plugiGroupsCliViews.every(leaf => leaf.view.contentEl.querySelector('[data-group-id=""] h2').textContent === ${JSON.stringify(name)})`), true);
  cli("enable", { group: name });
  assert.equal(evaluate(`app.plugins.enabledPlugins.has(${JSON.stringify(fixtureId)})`), true);
  cli("disable", { group: "ungrouped" });
  assert.deepEqual(evaluate('[...app.plugins.enabledPlugins].sort()'), beforeEnabled);
  cli("remove", { group: name, plugin: fixtureId, to: groupId });
  assert.ok(json("show", { group: groupId }).pluginIds.includes(fixtureId));
  cli("add", { group: name, plugin: fixtureId });
  assert.ok(!json("show", { group: groupId }).pluginIds.includes(fixtureId));
  assert.deepEqual(json("search", { query: fixtureId, group: name })[0].groupIds, ["ungrouped"]);
  cli("filter", { query: fixtureId, group: name });
  assert.equal(evaluate(`globalThis.__plugiGroupsCliViews.every(leaf => leaf.view.contentEl.querySelector(".plugin-groups-admin-ungrouped-search input").value === ${JSON.stringify(fixtureId)})`), true);
  cli("filter", { query: "", group: name });
  cli("add", { group: groupId, plugin: fixtureId });
  cli("filter", { query: "no-plugin-match", group: groupId });
  assert.equal(evaluate(`globalThis.__plugiGroupsCliViews.every(leaf => leaf.view.contentEl.querySelector('[data-group-id="${groupId}"] .plugin-groups-admin-plugin').hidden)`), true);
  cli("filter", { query: "", group: groupId });
  cli("reorder", { group: name, before: groupId });
  assert.match(obsidian("plugiGroups:delete", `group=${name}`), /permanent/);
  const before = json("structure");
  const missing = { ...before, groups: before.groups.filter(group => group.id !== "ungrouped") };
  assert.match(obsidian("plugiGroups:structure:set", `json=${JSON.stringify(missing)}`), /permanent/);
  assert.deepEqual(json("structure"), before);
}

function checkFailedSave() {
  const before = json("structure");
  evaluate('(globalThis.__plugiGroupsCliOriginalSave = app.plugins.plugins["plugin-groups-admin"].saveData, app.plugins.plugins["plugin-groups-admin"].saveData = async () => { throw new Error("CLI test save failure"); }, true)');
  try {
    assert.match(obsidian("plugiGroups:create", "name=Failed CLI save"), /Error: CLI test save failure/);
    assert.deepEqual(json("structure"), before, "A failed save must roll back in-memory changes");
  } finally {
    evaluate('(app.plugins.plugins["plugin-groups-admin"].saveData = globalThis.__plugiGroupsCliOriginalSave, delete globalThis.__plugiGroupsCliOriginalSave, true)');
  }
}

assert.equal(obsidian("vault", "info=path"), vaultRoot);
obsidian("plugin:reload", "id=plugin-groups-admin");
assert.match(obsidian("help", "plugiGroups:structure"), /plugiGroups:structure:set/);
try {
  await installFixtureAndOpenViews();
  const groupId = await checkCommands();
  checkPermanentGroup(groupId);
  checkStructureReplacement(groupId);
  checkFailedSave();
  console.log("All twenty native CLI commands passed in testVault_plugiGroups, including reload persistence, two-view refresh, dry-run, and save-failure rollback.");
} finally {
  evaluate('(globalThis.__plugiGroupsCliViews?.forEach(leaf => leaf.detach()), delete globalThis.__plugiGroupsCliViews, delete globalThis.__plugiGroupsCliReady, true)');
  obsidian("plugin:uninstall", `id=${fixtureId}`);
  rmSync(fixtureRoot, { recursive: true, force: true });
  writeFileSync(dataPath, originalData);
  obsidian("plugin:reload", "id=plugin-groups-admin");
  assert.deepEqual(JSON.parse(readFileSync(dataPath, "utf8")), JSON.parse(originalData));
}
