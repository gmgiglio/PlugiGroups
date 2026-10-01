import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

function runObsidianCli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluateInObsidian(expression) {
  const path = join(tmpdir(), `plugin-groups-window-${randomUUID()}.js`);
  writeFileSync(path, `JSON.stringify(${expression})`);
  try {
    const output = runObsidianCli("eval", `code=eval(require("fs").readFileSync(${JSON.stringify(path)},"utf8"))`);
    return output.includes("=> ") ? JSON.parse(output.slice(output.lastIndexOf("=> ") + 3).trim()) : null;
  } finally {
    unlinkSync(path);
  }
}

const vault = runObsidianCli("vault", "info=path").trim().split("\n").pop();
assert.ok(vault.endsWith("/PluginGroupsAdmin_ObsidianPlugin/testVault_plugiGroups"));
evaluateInObsidian(`(() => {
  const status = app.__dedicatedGroupsWindowTest = { done: false, error: null, result: null };
  void (async () => {
    const plugin = app.plugins.plugins["plugin-groups-admin"];
    const originalLocation = plugin.data.openLocation;
    const existing = new Set();
    app.workspace.iterateAllLeaves(leaf => existing.add(leaf));
    const originalMainViews = app.workspace.getLeavesOfType("plugin-groups-admin-view")
      .filter(leaf => leaf.getContainer() === app.workspace.rootSplit)
      .map(leaf => ({ leaf, state: leaf.getViewState() }));
    const pause = () => new Promise(resolve => setTimeout(resolve, 600));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    try {
      plugin.data.openLocation = "window";
      app.commands.executeCommandById("plugin-groups-admin:open-plugin-groups");
      await pause();
      const groupsLeaf = app.workspace.getLeavesOfType("plugin-groups-admin-view")
        .find(leaf => leaf.getContainer() !== app.workspace.rootSplit);
      check(!!groupsLeaf, "The dedicated window did not open");
      const container = groupsLeaf.getContainer();
      const style = element => container.win.getComputedStyle(element);
      check(container.doc.body.classList.contains("plugin-groups-admin-dedicated-window"), "Window styling missing");
      check(groupsLeaf.getViewState().pinned, "PlugiGroups is not pinned");
      for (const selector of [".workspace-tab-header-container-inner", ".workspace-tab-header-new-tab", ".workspace-tab-header-tab-list", ".view-header"]) {
        check(style(container.doc.querySelector(selector)).display === "none", selector + " is visible");
      }
      const header = container.doc.querySelector(".workspace-tab-header-container");
      check(container.win.getComputedStyle(header, "::after").content === '"PlugiGroups"', "Window title missing");
      check(header.getBoundingClientRect().height > 0, "Window drag region missing");
      app.workspace.setActiveLeaf(groupsLeaf, { focus: true });
      const extra = app.workspace.getLeaf("tab");
      await pause();
      check(extra.getContainer() === app.workspace.rootSplit, "New tab remained in the dedicated window");
      check(extra.getRoot() === app.workspace.rootSplit, "New tab moved to a sidebar instead of the main workspace");
      const windowLeaves = [];
      app.workspace.iterateAllLeaves(leaf => { if (leaf.getContainer() === container) windowLeaves.push(leaf); });
      check(windowLeaves.length === 1 && windowLeaves[0] === groupsLeaf, "Window is not exclusive to PlugiGroups");
      app.commands.executeCommandById("plugin-groups-admin:open-plugin-groups");
      await pause();
      check(app.workspace.getLeavesOfType("plugin-groups-admin-view").filter(leaf => leaf.getContainer() === container).length === 1, "Repeated opening duplicated the view");
      check(!app.workspace.rootSplit.doc.body.classList.contains("plugin-groups-admin-dedicated-window"), "Main window styles changed");
      for (const { leaf } of originalMainViews) await leaf.setViewState({ type: "empty" });
      const otherWindow = app.workspace.getLeaf("window");
      await otherWindow.setViewState({ type: "empty", active: true });
      app.workspace.setActiveLeaf(otherWindow, { focus: true });
      plugin.data.openLocation = "tab";
      app.commands.executeCommandById("plugin-groups-admin:open-plugin-groups");
      await pause();
      const mainGroupsLeaf = app.workspace.getLeavesOfType("plugin-groups-admin-view")
        .find(leaf => leaf.getContainer() === app.workspace.rootSplit);
      check(!!mainGroupsLeaf, "Tab mode opened in the active pop-out instead of the main window");
      check(otherWindow.getViewState().type === "empty", "Tab mode replaced the other window's view");
      app.workspace.setActiveLeaf(otherWindow, { focus: true });
      app.commands.executeCommandById("plugin-groups-admin:open-plugin-groups");
      await pause();
      const mainGroupsLeaves = app.workspace.getLeavesOfType("plugin-groups-admin-view")
        .filter(leaf => leaf.getContainer() === app.workspace.rootSplit);
      check(mainGroupsLeaves.length === 1 && mainGroupsLeaves[0] === mainGroupsLeaf, "Tab mode did not reuse the main window view");
      status.result = { chromeHidden: true, titleVisible: true, pinned: true, exclusive: true, tabRedirected: true, reused: true };
    } catch (error) {
      status.error = String(error);
    } finally {
      plugin.data.openLocation = originalLocation;
      const created = [];
      app.workspace.iterateAllLeaves(leaf => { if (!existing.has(leaf)) created.push(leaf); });
      for (const leaf of created) leaf.detach();
      for (const { leaf, state } of originalMainViews) await leaf.setViewState(state);
      status.done = true;
    }
  })();
  return true;
})()`);

let result = null;
for (let attempt = 0; attempt < 60; attempt++) {
  await setTimeout(250);
  result = evaluateInObsidian("app.__dedicatedGroupsWindowTest");
  if (result?.done) break;
}
assert.equal(result?.done, true, "Dedicated window test timed out");
assert.equal(result.error, null);
evaluateInObsidian("(delete app.__dedicatedGroupsWindowTest, true)");
console.log("Dedicated window controls passed; Tab mode creates and reuses its main window view from an active pop-out");
