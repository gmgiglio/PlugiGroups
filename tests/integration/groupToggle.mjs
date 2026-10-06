import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const vaultRoot = resolve(pluginRoot, "../testVault_plugiGroups");
const viewType = "plugin-groups-admin-view";
const suffix = randomUUID().slice(0, 8);
const fixtures = {
  alpha: { id: `group-toggle-alpha-${suffix}`, name: `Toggle Alpha ${suffix}`, refuses: false },
  beta: { id: `group-toggle-beta-${suffix}`, name: `Toggle Beta ${suffix}`, refuses: false },
  gamma: { id: `group-toggle-gamma-${suffix}`, name: `Toggle Gamma ${suffix}`, refuses: false },
  refused: { id: `group-toggle-refused-${suffix}`, name: `Toggle Refused ${suffix}`, refuses: true },
};
const cycleGroupId = `group-toggle-cycle-${suffix}`;
const refusedGroupId = `group-toggle-refused-${suffix}`;

function runCli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluate(expression, expectResult = true) {
  const path = join(tmpdir(), `group-toggle-${randomUUID()}.js`);
  writeFileSync(path, `JSON.stringify(${expression})`);
  try {
    const output = runCli("eval", `code=eval(require("fs").readFileSync(${JSON.stringify(path)},"utf8"))`);
    if (!expectResult && !output.includes("=> ")) return null;
    assert.ok(output.includes("=> "), output);
    return JSON.parse(output.slice(output.lastIndexOf("=> ") + 3).trim());
  } finally {
    unlinkSync(path);
  }
}

async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = evaluate(expression, false);
    if (result) return result;
    await setTimeout(100);
  }
  assert.fail(`Timed out: ${expression}`);
}

function fixtureFolder(fixture) {
  return join(vaultRoot, ".obsidian/plugins", fixture.id);
}

function installFixture(fixture) {
  assert.equal(existsSync(fixtureFolder(fixture)), false, "fixture directory already exists");
  mkdirSync(fixtureFolder(fixture));
  writeFileSync(join(fixtureFolder(fixture), "manifest.json"), JSON.stringify({ id: fixture.id, name: fixture.name, version: "1.0.0", minAppVersion: "1.0.0", description: "Group toggle test fixture" }));
  writeFileSync(join(fixtureFolder(fixture), "main.js"), fixture.refuses
    ? "throw new Error('Group toggle fixture refuses to load');"
    : "module.exports = class extends require('obsidian').Plugin {};");
}

function removeFixture(fixture) {
  try { runCli("plugin:uninstall", `id=${fixture.id}`); } catch { /* Remove test files below. */ }
  rmSync(fixtureFolder(fixture), { recursive: true, force: true });
}

async function loadFixtureManifests() {
  evaluate(`(() => {
    window.__groupToggleManifests = false;
    Promise.resolve(app.plugins.loadManifests()).then(() => { window.__groupToggleManifests = true; });
    return true;
  })()`);
  await waitFor("window.__groupToggleManifests === true");
  for (const fixture of Object.values(fixtures)) assert.equal(evaluate(`!!app.plugins.manifests[${JSON.stringify(fixture.id)}]`), true, `${fixture.id} manifest was not loaded`);
}

function scenarioHelpers() {
  return `
    const plugin = app.plugins.plugins["plugin-groups-admin"];
    const view = app.workspace.getLeavesOfType(${JSON.stringify(viewType)})[0].view;
    const ids = ${JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([key, fixture]) => [key, fixture.id])))};
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async (label, check) => {
      for (let attempt = 0; attempt < 100; attempt++) { if (check()) return; await sleep(50); }
      throw new Error("Timed out: " + label);
    };
    const expect = (label, actual, expected) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label + ": " + JSON.stringify({ actual, expected }));
    };
    const section = groupId => view.contentEl.querySelector('[data-group-id="' + groupId + '"]');
    const groupSwitch = groupId => section(groupId).querySelector(".plugin-groups-admin-group-toggle input");
    const position = groupId => { const input = groupSwitch(groupId); return input.indeterminate ? "partial" : input.checked ? "on" : "off"; };
    const row = (groupId, pluginId) => section(groupId).querySelector('[data-plugin-id="' + pluginId + '"]');
    const enabled = (...pluginIds) => pluginIds.map(id => app.plugins.enabledPlugins.has(id));
    const settle = async groupId => { await until("group idle", () => !groupSwitch(groupId).disabled); await sleep(150); };
    const clickGroup = async groupId => {
      const seen = [];
      const sample = setInterval(() => { const current = position(groupId); if (seen.at(-1) !== current) seen.push(current); }, 5);
      groupSwitch(groupId).click();
      await settle(groupId);
      clearInterval(sample);
      if (seen.at(-1) !== position(groupId)) seen.push(position(groupId));
      return seen;
    };
    const clickRow = async (groupId, pluginId) => {
      row(groupId, pluginId).querySelector(".plugin-groups-admin-toggle input").click();
      await settle(groupId);
    };
    const yellow = () => {
      const probe = view.contentEl.createDiv();
      probe.style.background = "var(--color-yellow)";
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    };
    const trackColor = groupId => getComputedStyle(groupSwitch(groupId).nextElementSibling).backgroundColor;
    const cycleGroup = plugin.data.groups.find(group => group.id === ${JSON.stringify(cycleGroupId)});
  `;
}

function runScenarioInObsidian() {
  evaluate(`(() => {
    window.__groupToggleTest = { done: false, error: null };
    void (async () => {
      const status = window.__groupToggleTest;
      try {
        ${scenarioHelpers()}
        await app.plugins.enablePluginAndSave(ids.alpha);
        view.refreshGroupsView();
        expect("mixed group shows the middle position", position(${JSON.stringify(cycleGroupId)}), "partial");
        expect("middle position uses the yellow track", trackColor(${JSON.stringify(cycleGroupId)}), yellow());

        expect("middle → all on without flicker", await clickGroup(${JSON.stringify(cycleGroupId)}), ["on"]);
        expect("all on", enabled(ids.alpha, ids.beta), [true, true]);
        expect("mix saved from the middle position", cycleGroup.savedMixPluginIds, [ids.alpha]);
        expect("all on → all off without flicker", await clickGroup(${JSON.stringify(cycleGroupId)}), ["off"]);
        expect("all off", enabled(ids.alpha, ids.beta), [false, false]);
        expect("all off → saved mix", await clickGroup(${JSON.stringify(cycleGroupId)}), ["partial"]);
        expect("saved mix restored", enabled(ids.alpha, ids.beta), [true, false]);

        await clickRow(${JSON.stringify(cycleGroupId)}, ids.beta);
        expect("enabling the last plugin by hand fills the group", position(${JSON.stringify(cycleGroupId)}), "on");
        expect("uniform group forgets its mix", "savedMixPluginIds" in cycleGroup, false);
        expect("all on → all off", await clickGroup(${JSON.stringify(cycleGroupId)}), ["off"]);
        expect("all off skips the forgotten mix", await clickGroup(${JSON.stringify(cycleGroupId)}), ["on"]);
        expect("both on after skipping the middle", enabled(ids.alpha, ids.beta), [true, true]);

        const refusedGroup = ${JSON.stringify(refusedGroupId)};
        expect("refused group starts off", position(refusedGroup), "off");
        await clickGroup(refusedGroup);
        expect("Obsidian refused only the failing fixture", enabled(ids.refused, ids.gamma), [false, true]);
        expect("refused plugin marked with its version", plugin.data.unenableablePlugins[ids.refused], "1.0.0");
        expect("refused group reaches fully on", position(refusedGroup), "on");
        expect("refused row shows the badge", row(refusedGroup, ids.refused).querySelector(".plugin-groups-admin-unenableable-badge")?.textContent, "Can't be enabled");
        expect("group switch skips the refused plugin", await clickGroup(refusedGroup), ["off"]);
        expect("group switch returns to fully on", await clickGroup(refusedGroup), ["on"]);
        await plugin.saveQueue;
      } catch (error) {
        status.error = String(error);
      } finally {
        status.done = true;
      }
    })();
    return true;
  })()`, false);
}

function assertRefusedMarkSurvivesReload() {
  runCli("plugin:reload", "id=plugin-groups-admin");
  runCli("command", "id=plugin-groups-admin:open-plugin-groups");
  const result = evaluate(`(() => {
    const plugin = app.plugins.plugins["plugin-groups-admin"];
    const view = app.workspace.getLeavesOfType(${JSON.stringify(viewType)})[0].view;
    view.refreshGroupsView();
    const section = view.contentEl.querySelector('[data-group-id="${refusedGroupId}"]');
    const input = section.querySelector(".plugin-groups-admin-group-toggle input");
    return { mark: plugin.data.unenableablePlugins[${JSON.stringify(fixtures.refused.id)}],
      badge: !!section.querySelector('[data-plugin-id="${fixtures.refused.id}"] .plugin-groups-admin-unenableable-badge'),
      position: input.indeterminate ? "partial" : input.checked ? "on" : "off" };
  })()`);
  assert.deepEqual(result, { mark: "1.0.0", badge: true, position: "on" }, "refused-plugin mark must survive a reload");
}

function addTestGroups() {
  evaluate(`(() => {
    const plugin = app.plugins.plugins["plugin-groups-admin"];
    plugin.data.allowMultipleGroups = true;
    plugin.data.collapseMode = "expanded";
    plugin.data.groups.push(
      { id: ${JSON.stringify(cycleGroupId)}, name: "Group toggle cycle ${suffix}", pluginIds: [${JSON.stringify(fixtures.alpha.id)}, ${JSON.stringify(fixtures.beta.id)}] },
      { id: ${JSON.stringify(refusedGroupId)}, name: "Group toggle refused ${suffix}", pluginIds: [${JSON.stringify(fixtures.refused.id)}, ${JSON.stringify(fixtures.gamma.id)}] });
    for (const leaf of app.workspace.getLeavesOfType(${JSON.stringify(viewType)})) leaf.view.refreshGroupsView();
    return true;
  })()`);
}

function restoreGroupData(original) {
  evaluate(`(() => {
    const plugin = app.plugins.plugins["plugin-groups-admin"];
    for (const key of Object.keys(plugin.data)) delete plugin.data[key];
    Object.assign(plugin.data, ${JSON.stringify(original)});
    void plugin.saveData(plugin.data);
    for (const leaf of app.workspace.getLeavesOfType(${JSON.stringify(viewType)})) leaf.view.refreshGroupsView();
    delete window.__groupToggleTest;
    delete window.__groupToggleManifests;
    return true;
  })()`, false);
}

assert.ok(runCli("vault", "info=path").trim().endsWith("/PluginGroupsAdmin_ObsidianPlugin/testVault_plugiGroups"), "Obsidian CLI must target the local test vault");
execFileSync("npm", ["run", "deploy:test"], { cwd: pluginRoot, stdio: "inherit" });
runCli("plugin:reload", "id=plugin-groups-admin");
await waitFor('!!app.plugins.plugins["plugin-groups-admin"]');
runCli("command", "id=plugin-groups-admin:open-plugin-groups");
await waitFor(`app.workspace.getLeavesOfType(${JSON.stringify(viewType)}).length > 0`);
const original = evaluate('app.plugins.plugins["plugin-groups-admin"].data');
try {
  for (const fixture of Object.values(fixtures)) installFixture(fixture);
  await loadFixtureManifests();
  addTestGroups();
  runScenarioInObsidian();
  const result = await waitFor("window.__groupToggleTest.done && window.__groupToggleTest");
  assert.equal(result.error, null);
  assertRefusedMarkSurvivesReload();
  console.log("Group toggle: middle position, saved-mix cycle, mix reset, no flicker, refused-plugin badge, and reload persistence passed");
} finally {
  restoreGroupData(original);
  for (const fixture of Object.values(fixtures)) removeFixture(fixture);
}
