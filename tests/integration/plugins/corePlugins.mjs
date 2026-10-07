import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { resolve } from "node:path";

const vaultRoot = resolve("../testVault_plugiGroups");
const viewType = "plugin-groups-admin-view";
function cli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}
function evaluate(expression) {
  const output = cli("eval", `code=JSON.stringify(${expression})`);
  assert.ok(output.includes("=> "), output);
  return JSON.parse(output.slice(output.lastIndexOf("=> ") + 3).trim());
}
async function waitFor(expression, expected) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (JSON.stringify(evaluate(expression)) === JSON.stringify(expected)) return;
    await setTimeout(100);
  }
  assert.deepEqual(evaluate(expression), expected);
}
const view = `app.workspace.getLeavesOfType('${viewType}').find(l=>l.view.context)?.view`;
const row = `${view}.contentEl.querySelector('[data-plugin-id="core:random-note"]')`;
assert.equal(cli("vault", "info=path").trim(), vaultRoot);
cli("command", "id=plugin-groups-admin:open-plugin-groups");
await setTimeout(200);
const snapshot = evaluate(`(()=>{const p=app.plugins.plugins['plugin-groups-admin'];return {data:p.data,enabled:app.internalPlugins.plugins['random-note'].enabled};})()`);
try {
  const inventory = evaluate(`${view}.context.getInstalledPlugins()`);
  const visible = evaluate(`Object.values(app.internalPlugins.plugins).filter(p=>!p.instance.hiddenFromList).length`);
  assert.equal(inventory.filter(p => p.kind === "core").length, visible);
  assert.equal(evaluate(`${view}.contentEl.querySelectorAll('.plugin-groups-admin-core-badge').length`), visible);
  assert.equal(inventory.some(p => p.id === "core:editor-status"), false);
  evaluate(`(()=>{const p=app.internalPlugins.plugins['random-note'];if(p.enabled)p.disable(true);return true;})()`);
  await waitFor(`${row}.querySelector('input').checked`, false);
  evaluate(`(()=>{const p=app.internalPlugins.plugins['random-note'];p.enable(true);return true;})()`);
  await waitFor(`${row}.querySelector('input').checked`, true);
  evaluate(`(()=>{const t=${row}.querySelector('input');t.checked=false;t.dispatchEvent(new Event('change'));return true;})()`);
  await waitFor(`app.internalPlugins.plugins['random-note'].enabled`, false);
  await waitFor(`${row}.querySelector('input').checked`, false);
  cli("eval", `code=window.__coreSettingsDestination=${view}.context.openPluginSettings('core:canvas')`);
  await waitFor(`window.__coreSettingsDestination`, "plugin");
  assert.equal(evaluate(`app.setting.activeTab.id`), "canvas");
  cli("eval", `code=window.__coreSettingsDestination=${view}.context.openPluginSettings('core:random-note')`);
  await waitFor(`window.__coreSettingsDestination`, "core");
  assert.equal(evaluate(`app.setting.activeTab.id`), "plugins");
  cli("eval", `code=(()=>{app.setting.close();delete window.__coreSettingsDestination;const p=app.plugins.plugins['plugin-groups-admin'];p.data.groups.push({id:'core-integration',name:'Core integration',pluginIds:['core:random-note','plugin-groups-admin']});${view}.context.queueGroupDataSave();${view}.context.refreshOpenGroupsViews();return true;})()`);
  await setTimeout(200);
  cli("plugiGroups:enable", "group=core-integration");
  await waitFor(`app.internalPlugins.plugins['random-note'].enabled`, true);
  cli("plugiGroups:disable", "group=core-integration");
  await waitFor(`app.internalPlugins.plugins['random-note'].enabled`, false);
  assert.equal(evaluate(`app.plugins.enabledPlugins.has('plugin-groups-admin')`), true);
  cli("plugin:reload", "id=plugin-groups-admin");
  await setTimeout(200);
  assert.equal(evaluate(`app.plugins.plugins['plugin-groups-admin'].data.groups.find(g=>g.id==='core-integration').pluginIds.includes('core:random-note')`), true);
  console.log("Core plugin inventory, native/UI toggles, live refresh, settings, mixed-group CLI toggles, and persistence passed.");
} finally {
  cli("eval", `code=(()=>{const p=app.plugins.plugins['plugin-groups-admin'];Object.assign(p.data,${JSON.stringify(snapshot.data)});p.saveData(p.data);const c=app.internalPlugins.plugins['random-note'];if(${snapshot.enabled})c.enable(true);else c.disable(true);app.setting.close();delete window.__coreSettingsDestination;${view}?.context.refreshOpenGroupsViews();return true;})()`);
  await setTimeout(200);
  cli("command", "id=plugin-groups-admin:open-plugin-groups");
}
