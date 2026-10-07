import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const groupId = `reorder-test-${randomUUID()}`;
const viewType = "plugin-groups-admin-view";

function runCli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluate(expression, expectResult = true) {
  const path = join(tmpdir(), `plugin-reorder-${randomUUID()}.js`);
  writeFileSync(path, `JSON.stringify(${expression})`);
  try {
    const run = () => runCli("eval", `code=eval(require("fs").readFileSync(${JSON.stringify(path)},"utf8"))`);
    let output = run();
    if (!expectResult && !output.includes("=> ")) return null;
    // The Obsidian CLI occasionally drops a reply while the app changes focus; calls expecting a result are reads or idempotent restores.
    for (let attempt = 1; attempt < 5 && !output.includes("=> "); attempt++) output = run();
    assert.ok(output.includes("=> "), output);
    return JSON.parse(output.slice(output.lastIndexOf("=> ") + 3).trim());
  } finally {
    unlinkSync(path);
  }
}

async function waitFor(expression) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = evaluate(expression, false);
    if (result) return result;
    await setTimeout(100);
  }
  assert.fail(`Timed out: ${expression}`);
}

assert.ok(runCli("vault", "info=path").trim().endsWith("/PluginGroupsAdmin_ObsidianPlugin/testVault_plugiGroups"));
const original = evaluate('app.plugins.plugins["plugin-groups-admin"].data');
let secondLeafId = null;
try {
  runCli("command", "id=plugin-groups-admin:open-plugin-groups");
  await waitFor(`app.workspace.getLeavesOfType(${JSON.stringify(viewType)}).length > 0`);
  evaluate(`(() => {
    window.__pluginReorderTest = { done: false, error: null, secondLeafId: null };
    void (async () => {
      const status = window.__pluginReorderTest;
      try {
        const plugin = app.plugins.plugins["plugin-groups-admin"];
        const first = app.workspace.getLeavesOfType(${JSON.stringify(viewType)})[0].view;
        const second = app.workspace.getLeaf("tab");
        status.secondLeafId = second.id;
        await second.setViewState({ type: ${JSON.stringify(viewType)}, active: true });
        const other = second.view;
        first.setSearchFilter("", null);
        const ids = [...new Set(Array.from(first.contentEl.querySelectorAll(".plugin-groups-admin-plugin")).map(row => row.dataset.pluginId))].slice(0, 3);
        if (ids.length !== 3) throw new Error("Need three installed plugins");
        const group = { id: ${JSON.stringify(groupId)}, name: "Plugin reorder test", pluginIds: [...ids].reverse() };
        const sibling = { id: ${JSON.stringify(`${groupId}-other`)}, name: "Plugin reorder other", pluginIds: [...ids] };
        plugin.data.allowMultipleGroups = true;
        plugin.data.alphabeticalPluginOrder = false;
        plugin.data.collapseMode = "expanded";
        for (const existing of plugin.data.groups) existing.pluginIds = existing.pluginIds.filter(id => !ids.includes(id));
        plugin.data.groups.push(group, sibling);
        first.refreshGroupsView();
        other.refreshGroupsView();
        app.workspace.setActiveLeaf(first.leaf, { focus: true });
        await new Promise(resolve => first.contentEl.ownerDocument.defaultView.requestAnimationFrame(resolve));
        const section = view => view.contentEl.querySelector('[data-group-id="' + group.id + '"]');
        const rows = view => [...section(view).querySelectorAll(".plugin-groups-admin-plugin")];
        const order = view => rows(view).map(row => row.dataset.pluginId);
        const expect = (actual, expected) => {
          if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
        };
        const drop = (id, targetId, position) => {
          const source = rows(first).find(row => row.dataset.pluginId === id);
          const target = rows(first).find(row => row.dataset.pluginId === targetId);
          const win = source.ownerDocument.defaultView;
          const transfer = new win.DataTransfer();
          source.dispatchEvent(new win.DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
          const bounds = target.getBoundingClientRect();
          const clientY = bounds.top + bounds.height * (position === "before" ? 0.25 : 0.75);
          target.dispatchEvent(new win.DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY }));
          if (!target.classList.contains("is-plugin-drop-" + position)) throw new Error("Missing insertion marker: " + JSON.stringify({ position, bounds: bounds.toJSON(), marked: section(first).querySelector(".is-plugin-drop-before, .is-plugin-drop-after")?.dataset.pluginId }));
          target.dispatchEvent(new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY }));
          expect(order(first), group.pluginIds);
          expect(order(other), group.pluginIds);
          expect(sibling.pluginIds, ids);
        };
        expect(order(first), [...ids].reverse());
        const alphabetically = rows(first).slice().sort((a, b) =>
          a.querySelector(".plugin-groups-admin-plugin-name").textContent.localeCompare(b.querySelector(".plugin-groups-admin-plugin-name").textContent)
        ).map(row => row.dataset.pluginId);
        const toggleOrder = () => first.contentEl.querySelector(".plugin-groups-admin-alphabetical-order").click();
        toggleOrder();
        expect(order(first), alphabetically);
        expect(order(other), alphabetically);
        expect(group.pluginIds, [...ids].reverse());
        if (other.contentEl.querySelector(".plugin-groups-admin-alphabetical-order").getAttribute("aria-pressed") !== "true") throw new Error("Sort toggle did not sync");
        const sortedRow = rows(first)[0];
        const win = sortedRow.ownerDocument.defaultView;
        const transfer = new win.DataTransfer();
        sortedRow.dispatchEvent(new win.DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
        const last = rows(first)[2];
        const clientY = last.getBoundingClientRect().bottom - 1;
        last.dispatchEvent(new win.DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY }));
        if (section(first).querySelector(".is-plugin-drop-before, .is-plugin-drop-after")) throw new Error("Custom reorder marker shown while sorted");
        last.dispatchEvent(new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer, clientY }));
        expect(group.pluginIds, [...ids].reverse());
        toggleOrder();
        expect(order(first), [...ids].reverse());
        expect(order(other), [...ids].reverse());
        drop(ids[2], ids[0], "after");
        expect(group.pluginIds, [ids[1], ids[0], ids[2]]);
        drop(ids[2], ids[1], "before");
        expect(group.pluginIds, [ids[2], ids[1], ids[0]]);
        plugin.data.allowMultipleGroups = false;
        drop(ids[0], ids[2], "before");
        expect(group.pluginIds, [ids[0], ids[2], ids[1]]);
        toggleOrder();
        await plugin.saveQueue;
        status.expected = [...group.pluginIds];
        status.alphabetical = alphabetically;
      } catch (error) {
        status.error = String(error);
      } finally {
        status.done = true;
      }
    })();
    return true;
  })()`, false);
  const result = await waitFor("window.__pluginReorderTest.done && window.__pluginReorderTest");
  secondLeafId = result.secondLeafId;
  assert.equal(result.error, null);
  runCli("plugin:reload", "id=plugin-groups-admin");
  await waitFor('!!app.plugins.plugins["plugin-groups-admin"]');
  assert.deepEqual(evaluate(`app.plugins.plugins["plugin-groups-admin"].data.groups.find(group => group.id === ${JSON.stringify(groupId)}).pluginIds`), result.expected);
  runCli("command", "id=plugin-groups-admin:open-plugin-groups");
  assert.equal(evaluate('app.plugins.plugins["plugin-groups-admin"].data.alphabeticalPluginOrder'), true);
  assert.deepEqual(evaluate(`Array.from(app.workspace.getLeavesOfType(${JSON.stringify(viewType)})[0].view.contentEl.querySelectorAll('[data-group-id="' + ${JSON.stringify(groupId)} + '"] .plugin-groups-admin-plugin')).map(row => row.dataset.pluginId)`), result.alphabetical);
  console.log("Plugin ordering: drag markers, both membership modes, A–Z toggle, custom order preservation, two-tab sync, and reload persistence passed");
} finally {
  evaluate(`(() => {
    const plugin = app.plugins.plugins["plugin-groups-admin"];
    Object.assign(plugin.data, ${JSON.stringify(original)});
    void plugin.saveData(plugin.data);
    const secondId = ${JSON.stringify(secondLeafId)} ?? window.__pluginReorderTest?.secondLeafId;
    for (const leaf of app.workspace.getLeavesOfType(${JSON.stringify(viewType)})) {
      if (leaf.id === secondId) leaf.detach();
      else leaf.view.refreshGroupsView();
    }
    delete window.__pluginReorderTest;
    return true;
  })()`);
}
