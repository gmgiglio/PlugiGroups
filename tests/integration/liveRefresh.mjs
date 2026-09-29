import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const pluginRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const vaultRoot = resolve(pluginRoot, "../testVault_plugiGroups");
const fixtureId = `plugin-groups-admin-integration-${randomUUID().slice(0, 8)}`;
const fixtureName = `Integration Fixture ${fixtureId.slice(-8)}`;
const fixtureRoot = join(vaultRoot, ".obsidian/plugins", fixtureId);
const viewType = "plugin-groups-admin-view";

function runObsidianCli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluateInObsidian(expression) {
  const code = `JSON.stringify((() => { try { return ${expression}; } catch (error) { return { __error: String(error) }; } })())`;
  const output = runObsidianCli("eval", `code=${code}`);
  const result = output.slice(output.lastIndexOf("=> ") + 3).trim();
  assert.ok(output.includes("=> "), `Obsidian eval returned no result for ${code}: ${output}`);
  const value = JSON.parse(result);
  assert.equal(value?.__error, undefined, `Obsidian eval failed: ${value?.__error}`);
  return value;
}

function fixturePluginRowExpression() {
  return `[...globalThis.__pluginGroupsRefreshTest.view.contentEl.querySelectorAll(".plugin-groups-admin-plugin")].find(row => row.querySelector(".plugin-groups-admin-plugin-name")?.textContent === ${JSON.stringify(fixtureName)})`;
}

function currentFixtureViewState() {
  return evaluateInObsidian(`(() => {
    const row = ${fixturePluginRowExpression()};
    return { count: globalThis.__pluginGroupsRefreshTest?.count,
      installed: !!app.plugins.manifests[${JSON.stringify(fixtureId)}],
      managerEnabled: app.plugins.enabledPlugins.has(${JSON.stringify(fixtureId)}), present: !!row,
      enabled: row?.querySelector("input[type=checkbox]")?.checked,
      details: row?.querySelector(".plugin-groups-admin-plugin-description")?.textContent };
  })()`);
}

async function waitForFixtureViewState(action, before, expected) {
  let current;
  for (let attempt = 0; attempt < 50; attempt++) {
    current = currentFixtureViewState();
    if (current.count > before && Object.entries(expected).every(([key, value]) => current[key] === value)) return;
    await setTimeout(100);
  }
  assert.fail(`${action} did not refresh the open tab to the expected state: ${JSON.stringify({ before, expected, current })}`);
}

async function waitForFixtureManifest() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = evaluateInObsidian(`({ done: globalThis.__pluginGroupsManifestLoad?.done,
      error: globalThis.__pluginGroupsManifestLoad?.error,
      installed: !!app.plugins.manifests[${JSON.stringify(fixtureId)}] })`);
    if (result.error) throw new Error(result.error);
    if (result.done) return assert.equal(result.installed, true, "fixture manifest was not loaded");
    await setTimeout(100);
  }
  assert.fail("timed out loading the fixture manifest in Obsidian");
}

function installFixtureFiles() {
  assert.equal(existsSync(fixtureRoot), false, "fixture directory already exists");
  mkdirSync(fixtureRoot);
  writeFileSync(join(fixtureRoot, "manifest.json"), JSON.stringify({ id: fixtureId, name: fixtureName, version: "1.0.0", minAppVersion: "1.0.0", description: "Live refresh test fixture" }));
  writeFileSync(join(fixtureRoot, "main.js"), "module.exports = class extends require('obsidian').Plugin {};");
}

function startFixtureManifestLoad() {
  evaluateInObsidian(`(() => {
    const status = { done: false, error: null };
    globalThis.__pluginGroupsManifestLoad = status;
    Promise.resolve(app.plugins.loadManifests()).then(() => { status.done = true; }, error => { status.error = String(error); status.done = true; });
    return { started: true };
  })()`);
}

function trackOpenGroupsViewRefreshes() {
  const result = evaluateInObsidian(`(() => {
    const views = app.workspace.getLeavesOfType(${JSON.stringify(viewType)});
    const view = views[0]?.view;
    if (!view) return { open: false };
    const original = view.refreshGroupsView;
    const test = { count: 0, view, original };
    globalThis.__pluginGroupsRefreshTest = test;
    view.refreshGroupsView = function () { test.count++; return original.call(this); };
    return { open: true, views: views.length };
  })()`);
  assert.equal(result.open, true, "plugin group tab did not open");
}

function assertUnchangedEventsDoNotRender() {
  const result = evaluateInObsidian(`(() => {
    const test = globalThis.__pluginGroupsRefreshTest;
    const header = test.view.contentEl.querySelector(".plugin-groups-admin-header");
    const before = test.count;
    app.workspace.trigger("layout-change");
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    return { renders: test.count - before, sameHeader: header === test.view.contentEl.querySelector(".plugin-groups-admin-header") };
  })()`);
  assert.deepEqual(result, { renders: 0, sameHeader: true });
}

async function waitForFixtureVersionRefresh(before, version) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = currentFixtureViewState();
    if (current.count > before) {
      assert.equal(current.count, before + 1);
      assert.match(current.details, new RegExp(version.replaceAll(".", "\\.")));
      return;
    }
    await setTimeout(100);
  }
  assert.fail(`tab did not refresh to version ${version}`);
}

async function assertMissedChangesRefresh() {
  const beforeLayout = currentFixtureViewState().count;
  evaluateInObsidian(`(setTimeout(() => { app.plugins.manifests[${JSON.stringify(fixtureId)}].version = "2.0.0"; app.workspace.trigger("layout-change"); }, 0), true)`);
  await waitForFixtureVersionRefresh(beforeLayout, "2.0.0");
  const beforeFocus = currentFixtureViewState().count;
  evaluateInObsidian(`(setTimeout(() => { app.plugins.manifests[${JSON.stringify(fixtureId)}].version = "3.0.0"; window.dispatchEvent(new Event("focus")); }, 0), true)`);
  await waitForFixtureVersionRefresh(beforeFocus, "3.0.0");
}

function restoreGroupsViewRefresh() {
  try {
    evaluateInObsidian(`(() => {
      const test = globalThis.__pluginGroupsRefreshTest;
      if (test) test.view.refreshGroupsView = test.original;
      delete globalThis.__pluginGroupsRefreshTest;
      delete globalThis.__pluginGroupsManifestLoad;
      return true;
    })()`);
  } catch (error) {
    console.error("Could not restore the Obsidian view wrapper:", error);
  }
}

async function runLiveRefreshIntegrationTest() {
  const actualVault = runObsidianCli("vault", "info=path").trim().split("\n").pop();
  assert.equal(actualVault, vaultRoot, "Obsidian CLI must target the local test vault");
  execFileSync("npm", ["run", "deploy:test"], { cwd: pluginRoot, stdio: "inherit" });
  runObsidianCli("plugin:reload", "id=plugigroups");
  runObsidianCli("command", "id=plugigroups:open-plugin-groups");
  trackOpenGroupsViewRefreshes();
  try {
    assertUnchangedEventsDoNotRender();
    installFixtureFiles();
    const beforeInstall = currentFixtureViewState().count;
    startFixtureManifestLoad();
    await waitForFixtureManifest();
    await waitForFixtureViewState("install", beforeInstall, { installed: true, managerEnabled: false, present: true, enabled: false });
    const beforeEnable = currentFixtureViewState().count;
    runObsidianCli("plugin:enable", `id=${fixtureId}`);
    await waitForFixtureViewState("enable", beforeEnable, { installed: true, managerEnabled: true, present: true, enabled: true });
    const beforeDisable = currentFixtureViewState().count;
    runObsidianCli("plugin:disable", `id=${fixtureId}`);
    await waitForFixtureViewState("disable", beforeDisable, { installed: true, managerEnabled: false, present: true, enabled: false });
    await assertMissedChangesRefresh();
    const beforeUninstall = currentFixtureViewState().count;
    runObsidianCli("plugin:uninstall", `id=${fixtureId}`);
    await waitForFixtureViewState("uninstall", beforeUninstall, { installed: false, managerEnabled: false, present: false });
    console.log("Live refresh integration test passed in testVault_plugiGroups");
  } finally {
    restoreGroupsViewRefresh();
    try { if (existsSync(fixtureRoot)) runObsidianCli("plugin:uninstall", `id=${fixtureId}`); } catch { /* Remove test files below. */ }
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

await runLiveRefreshIntegrationTest();
