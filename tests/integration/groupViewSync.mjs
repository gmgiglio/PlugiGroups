import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const viewType = "plugin-groups-admin-view";
const groupName = `View sync ${randomUUID().slice(0, 8)}`;

function runObsidianCli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluateInObsidian(expression, expectResult = true) {
  const path = join(tmpdir(), `plugin-groups-eval-${randomUUID()}.js`);
  new Function(`return JSON.stringify(${expression})`);
  writeFileSync(path, `JSON.stringify(${expression})`);
  try {
    const output = runObsidianCli("eval", `code=eval(require("fs").readFileSync(${JSON.stringify(path)},"utf8"))`);
    if (!expectResult && !output.includes("=> ")) return null;
    assert.ok(output.includes("=> "), `Obsidian eval returned no result: ${output}`);
    return JSON.parse(output.slice(output.lastIndexOf("=> ") + 3).trim());
  } finally {
    unlinkSync(path);
  }
}

async function waitForGroupViewSyncResult() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const result = evaluateInObsidian("globalThis.__pluginGroupsViewSyncTest");
      if (result?.done) return result;
    } catch (error) {
      if (attempt === 49) throw error;
    }
    await setTimeout(100);
  }
  assert.fail("Timed out waiting for the two-tab group edit test");
}

async function waitForGroupsView() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if (evaluateInObsidian(`app.workspace.getLeavesOfType(${JSON.stringify(viewType)}).length`) > 0) return;
    } catch (error) {
      if (attempt === 49) throw error;
    }
    await setTimeout(100);
  }
  assert.fail("The plugin group tab did not open");
}

const vault = runObsidianCli("vault", "info=path").trim().split("\n").pop();
assert.ok(vault.endsWith("/PluginGroupsAdmin_ObsidianPlugin/testVault_plugiGroups"));
runObsidianCli("command", "id=plugigroups:open-plugin-groups");
await waitForGroupsView();

evaluateInObsidian(`(() => {
  const status = { done: false, error: null, result: null };
  globalThis.__pluginGroupsViewSyncTest = status;
  void (async () => {
    const plugin = app.plugins.plugins["plugigroups"];
    const first = app.workspace.getLeavesOfType(${JSON.stringify(viewType)})[0].view;
    const originalIndex = plugin.data.ungroupedIndex;
    let second = null;
    try {
      second = app.workspace.getLeaf("tab");
      await second.setViewState({ type: ${JSON.stringify(viewType)}, active: true });
      const other = second.view;
      first.contentEl.querySelector(".plugin-groups-admin-add-button").click();
      const form = first.contentEl.querySelector(".plugin-groups-admin-add");
      form.querySelector("input").value = ${JSON.stringify(groupName)};
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      const group = plugin.data.groups.find(item => item.name === ${JSON.stringify(groupName)});
      if (!group) throw new Error("The group was not created");
      const section = view => view.contentEl.querySelector('[data-group-id="' + group.id + '"]');
      if (!section(first) || !section(other)) throw new Error("The new group did not appear in both tabs");
      group.pluginIds.push("plugigroups");
      first.refreshGroupsView();
      other.refreshGroupsView();
      if (!section(other).querySelector(".plugin-groups-admin-plugin")) throw new Error("Membership setup failed");
      const originalRefresh = other.refreshGroupsView;
      let refreshes = 0;
      other.refreshGroupsView = function () { refreshes++; return originalRefresh.call(this); };
      try {
        section(first).querySelector(".plugin-groups-admin-remove-plugin").click();
      } finally {
        other.refreshGroupsView = originalRefresh;
      }
      status.result = {
        refreshes,
        membershipRemoved: !group.pluginIds.includes("plugigroups"),
        firstEmpty: !section(first).querySelector(".plugin-groups-admin-plugin"),
        secondEmpty: !section(other).querySelector(".plugin-groups-admin-plugin"),
      };
    } catch (error) {
      status.error = String(error);
    } finally {
      await plugin.saveQueue;
      const index = plugin.data.groups.findIndex(item => item.name === ${JSON.stringify(groupName)});
      if (index >= 0) plugin.data.groups.splice(index, 1);
      plugin.data.ungroupedIndex = originalIndex;
      await plugin.saveData(plugin.data);
      first.refreshGroupsView();
      if (second) second.detach();
      status.done = true;
    }
  })();
  return true;
})()`, false);

const result = await waitForGroupViewSyncResult();
assert.equal(result.error, null);
assert.deepEqual(result.result, { refreshes: 1, membershipRemoved: true, firstEmpty: true, secondEmpty: true });
evaluateInObsidian("(delete globalThis.__pluginGroupsViewSyncTest, true)");
console.log("Group edits refreshed both open tabs in testVault_plugiGroups");
