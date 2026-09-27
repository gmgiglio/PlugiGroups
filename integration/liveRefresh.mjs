import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const pluginRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const vaultRoot = resolve(pluginRoot, "../test_vault");
const fixtureId = `plugin-groups-admin-integration-${randomUUID().slice(0, 8)}`;
const fixtureName = `Integration Fixture ${fixtureId.slice(-8)}`;
const fixtureRoot = join(vaultRoot, ".obsidian/plugins", fixtureId);
const viewType = "plugin-groups-admin-view";

function cli(command, ...args) {
  return execFileSync("obsidian", ["vault=test_vault", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluate(expression) {
  const code = `JSON.stringify((() => { try { return ${expression}; } catch (error) { return { __error: String(error) }; } })())`;
  const output = cli("eval", `code=${code}`);
  const result = output.slice(output.lastIndexOf("=> ") + 3).trim();
  assert.ok(output.includes("=> "), `Obsidian eval returned no result for ${code}: ${output}`);
  const value = JSON.parse(result);
  assert.equal(value?.__error, undefined, `Obsidian eval failed: ${value?.__error}`);
  return value;
}

function fixtureRow() {
  return `[...document.querySelectorAll(".plugin-groups-admin-plugin")].find(row => row.querySelector(".plugin-groups-admin-plugin-name")?.textContent === ${JSON.stringify(fixtureName)})`;
}

function state() {
  return evaluate(`(() => {
    const row = ${fixtureRow()};
    return { count: globalThis.__pluginGroupsRefreshTest?.count, present: !!row,
      enabled: row?.querySelector("input[type=checkbox]")?.checked,
      details: row?.querySelector(".plugin-groups-admin-plugin-description")?.textContent };
  })()`);
}

async function waitForFixtureManifest() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = evaluate(`({ done: globalThis.__pluginGroupsManifestLoad?.done,
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

function startManifestLoad() {
  evaluate(`(() => {
    const status = { done: false, error: null };
    globalThis.__pluginGroupsManifestLoad = status;
    Promise.resolve(app.plugins.loadManifests()).then(() => { status.done = true; }, error => { status.error = String(error); status.done = true; });
    return { started: true };
  })()`);
}

function instrumentOpenView() {
  const result = evaluate(`(() => {
    const views = app.workspace.getLeavesOfType(${JSON.stringify(viewType)});
    const view = views[0]?.view;
    if (!view) return { open: false };
    const original = view.refresh;
    const test = { count: 0, view, original };
    globalThis.__pluginGroupsRefreshTest = test;
    view.refresh = function () { test.count++; return original.call(this); };
    return { open: true, views: views.length };
  })()`);
  assert.equal(result.open, true, "plugin group tab did not open");
}

function assertUnchangedEventsDoNotRender() {
  const result = evaluate(`(() => {
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

async function waitForRefresh(before, version) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = state();
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
  const beforeLayout = state().count;
  evaluate(`(setTimeout(() => { app.plugins.manifests[${JSON.stringify(fixtureId)}].version = "2.0.0"; app.workspace.trigger("layout-change"); }, 0), true)`);
  await waitForRefresh(beforeLayout, "2.0.0");
  const beforeFocus = state().count;
  evaluate(`(setTimeout(() => { app.plugins.manifests[${JSON.stringify(fixtureId)}].version = "3.0.0"; window.dispatchEvent(new Event("focus")); }, 0), true)`);
  await waitForRefresh(beforeFocus, "3.0.0");
}

function restoreView() {
  try {
    evaluate(`(() => {
      const test = globalThis.__pluginGroupsRefreshTest;
      if (test) test.view.refresh = test.original;
      delete globalThis.__pluginGroupsRefreshTest;
      delete globalThis.__pluginGroupsManifestLoad;
      return true;
    })()`);
  } catch (error) {
    console.error("Could not restore the Obsidian view wrapper:", error);
  }
}

async function run() {
  const actualVault = cli("vault", "info=path").trim().split("\n").pop();
  assert.equal(actualVault, vaultRoot, "Obsidian CLI must target the local test vault");
  execFileSync("npm", ["run", "deploy:test"], { cwd: pluginRoot, stdio: "inherit" });
  cli("plugin:reload", "id=plugin-groups-admin");
  cli("command", "id=plugin-groups-admin:open-plugin-groups");
  instrumentOpenView();
  try {
    assertUnchangedEventsDoNotRender();
    installFixtureFiles();
    startManifestLoad();
    await waitForFixtureManifest();
    assert.equal(state().present, true, "install did not update the open tab");
    cli("plugin:enable", `id=${fixtureId}`);
    assert.equal(state().enabled, true, "enable did not update the open tab");
    cli("plugin:disable", `id=${fixtureId}`);
    assert.equal(state().enabled, false, "disable did not update the open tab");
    await assertMissedChangesRefresh();
    cli("plugin:uninstall", `id=${fixtureId}`);
    assert.equal(state().present, false, "uninstall did not update the open tab");
    console.log("Live refresh integration test passed in test_vault");
  } finally {
    restoreView();
    try { if (existsSync(fixtureRoot)) cli("plugin:uninstall", `id=${fixtureId}`); } catch { /* Remove test files below. */ }
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

await run();
