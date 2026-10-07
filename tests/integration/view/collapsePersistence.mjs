import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const pluginId = "plugin-groups-admin";
const viewType = "plugin-groups-admin-view";
const groupId = randomUUID();
const expandedId = randomUUID();

function cli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluate(expression, expectResult = true) {
  const path = join(tmpdir(), `collapse-persistence-${randomUUID()}.js`);
  new Function(`return JSON.stringify(${expression})`);
  writeFileSync(path, `JSON.stringify(${expression})`);
  try {
    const output = cli("eval", `code=eval(require("fs").readFileSync(${JSON.stringify(path)},"utf8"))`);
    if (!expectResult && !output.includes("=> ")) return null;
    assert.ok(output.includes("=> "), output);
    return JSON.parse(output.slice(output.lastIndexOf("=> ") + 3).trim());
  } finally {
    unlinkSync(path);
  }
}

async function runInApp(code) {
  evaluate(`(() => {
    globalThis.__collapsePersistenceTest = { done: false, error: null };
    void (async () => { ${code} })().then(
      () => { globalThis.__collapsePersistenceTest.done = true; },
      error => { globalThis.__collapsePersistenceTest = { done: true, error: String(error) }; });
    return true;
  })()`, false);
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = evaluate("globalThis.__collapsePersistenceTest", false);
    if (status?.done) {
      assert.equal(status.error, null);
      return;
    }
    await setTimeout(100);
  }
  assert.fail("Timed out waiting for collapse persistence test");
}

const setup = `
  const plugin = app.plugins.plugins[${JSON.stringify(pluginId)}];
  const leaves = () => app.workspace.getLeavesOfType(${JSON.stringify(viewType)});
  const section = (view, id) => view.contentEl.querySelector('[data-group-id="' + (id ?? '') + '"]');
  const isCollapsed = (view, id) => section(view, id).querySelector(".plugin-groups-admin-section-body").hidden;
  const selectMode = (view, mode) => {
    for (let step = 0; step < 3 && plugin.data.collapseMode !== mode; step++) {
      view.contentEl.querySelector(".plugin-groups-admin-collapse-cycle").click();
    }
  };
  const toggle = (view, id) => section(view, id).querySelector(".plugin-groups-admin-collapse").click();
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const open = async () => {
    const leaf = app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: ${JSON.stringify(viewType)}, active: true });
    return leaf.view;
  };
`;

assert.ok(cli("vault", "info=path").trim().split("\n").pop().endsWith("/PluginGroupsAdmin_ObsidianPlugin/testVault_plugiGroups"));
const original = evaluate(`app.plugins.plugins[${JSON.stringify(pluginId)}].data`);
try {
  await runInApp(`${setup}
    plugin.data.groups.push({ id: ${JSON.stringify(groupId)}, name: "Collapse persistence fixture", pluginIds: [] },
      { id: ${JSON.stringify(expandedId)}, name: "Expanded persistence fixture", pluginIds: [] });
    plugin.data.collapsedGroupIds = [];
    plugin.data.collapseMode = "individual";
    plugin.data.collapseModeExceptionIds = [];
    const first = await open();
    const second = await open();
    toggle(first, ${JSON.stringify(groupId)});
    toggle(first, null);
    check(isCollapsed(second, ${JSON.stringify(groupId)}) && isCollapsed(second, null), "Open tabs did not synchronize");
    check(!isCollapsed(second, ${JSON.stringify(expandedId)}), "Expanded group changed state");
    await plugin.saveQueue;
    for (const leaf of leaves()) leaf.detach();
    const reopened = await open();
    check(isCollapsed(reopened, ${JSON.stringify(groupId)}) && isCollapsed(reopened, null), "Closing and reopening lost collapse state");
  `);
  cli("plugin:reload", `id=${pluginId}`);
  await runInApp(`${setup}
    const view = await open();
    check(isCollapsed(view, ${JSON.stringify(groupId)}) && isCollapsed(view, null), "Plugin reload lost collapse state");
    check(!isCollapsed(view, ${JSON.stringify(expandedId)}), "Plugin reload lost expanded state");
    toggle(view, ${JSON.stringify(groupId)});
    toggle(view, null);
    await plugin.saveQueue;
  `);
  cli("plugin:reload", `id=${pluginId}`);
  await runInApp(`${setup}
    const view = await open();
    check(!isCollapsed(view, ${JSON.stringify(groupId)}) && !isCollapsed(view, null), "Expansion did not persist across reload");
    toggle(view, ${JSON.stringify(groupId)});
    toggle(view, null);
    const second = await open();
    const cycleButton = view.contentEl.querySelector(".plugin-groups-admin-collapse-cycle");
    check(view.contentEl.querySelector(".plugin-groups-admin-summary").nextElementSibling?.firstElementChild === cycleButton, "Cycle button must appear after the stats");
    for (const mode of ["collapsed", "expanded", "individual"]) {
      const cycle = second.contentEl.querySelector(".plugin-groups-admin-collapse-cycle");
      cycle.focus();
      cycle.click();
      check(plugin.data.collapseMode === mode, "Cycle button selected the wrong mode");
      for (const target of [view, second]) {
        check(target.contentEl.querySelector(".plugin-groups-admin-collapse-cycle").dataset.currentMode === mode, "Cycle button did not synchronize");
        const label = { individual: "some expanded", collapsed: "all collapsed", expanded: "all expanded" }[mode];
        check(target.contentEl.querySelector(".plugin-groups-admin-collapse-cycle").textContent === label, "Cycle button text did not update");
      }
      check(second.contentEl.ownerDocument.activeElement === second.contentEl.querySelector(".plugin-groups-admin-collapse-cycle"), "Cycle button lost keyboard focus");
    }
    for (const mode of ["collapsed", "expanded", "individual", "collapsed"]) {
      selectMode(view, mode);
      for (const target of [view, second]) {
        check(target.contentEl.querySelector(".plugin-groups-admin-collapse-cycle").dataset.currentMode === mode, "Active mode did not synchronize");
        if (mode === "individual") {
          check(isCollapsed(target, ${JSON.stringify(groupId)}) && isCollapsed(target, null) && !isCollapsed(target, ${JSON.stringify(expandedId)}), "Saved states were lost");
        } else {
          check(Array.from(target.contentEl.querySelectorAll(".plugin-groups-admin-section-body")).every(body => body.hidden === (mode === "collapsed")), "Global mode did not apply to all sections");
        }
      }
    }
    check(plugin.data.collapsedGroupIds.includes(${JSON.stringify(groupId)}) && !plugin.data.collapsedGroupIds.includes(${JSON.stringify(expandedId)}), "Modes changed saved individual states");
    await plugin.saveQueue;
  `);
  cli("plugin:reload", `id=${pluginId}`);
  await runInApp(`${setup}
    const view = await open();
    check(plugin.data.collapseMode === "collapsed" && isCollapsed(view, ${JSON.stringify(expandedId)}), "Collapsed mode did not persist");
    toggle(view, ${JSON.stringify(groupId)});
    check(plugin.data.collapseMode === "collapsed" && !plugin.data.collapsedGroupIds.includes(${JSON.stringify(groupId)}) && !isCollapsed(view, ${JSON.stringify(groupId)}), "Expansion must update saved state without changing global mode");
    check(isCollapsed(view, ${JSON.stringify(expandedId)}) && isCollapsed(view, null), "Individual expansion changed other sections");
    selectMode(view, "expanded");
    await plugin.saveQueue;
  `);
  cli("plugin:reload", `id=${pluginId}`);
  await runInApp(`${setup}
    const view = await open();
    check(plugin.data.collapseMode === "expanded" && !isCollapsed(view, null), "Expanded mode did not persist");
    toggle(view, ${JSON.stringify(groupId)});
    check(plugin.data.collapseMode === "expanded" && plugin.data.collapsedGroupIds.includes(${JSON.stringify(groupId)}) && isCollapsed(view, ${JSON.stringify(groupId)}), "Collapse must update saved state without changing global mode");
    check(!isCollapsed(view, ${JSON.stringify(expandedId)}) && !isCollapsed(view, null), "Individual collapse changed other sections");
    selectMode(view, "collapsed");
    view.contentEl.querySelector(".plugin-groups-admin-ungrouped-search-button").click();
    check(plugin.data.collapseMode === "collapsed" && !isCollapsed(view, null), "Ungrouped search must expand without changing global mode");
    const second = await open();
    check(!isCollapsed(second, null) && isCollapsed(second, ${JSON.stringify(groupId)}), "Manual changes must synchronize without affecting others");
    await plugin.saveQueue;
  `);
  cli("plugin:reload", `id=${pluginId}`);
  await runInApp(`${setup}
    const view = await open();
    check(plugin.data.collapseMode === "collapsed" && !isCollapsed(view, null) && isCollapsed(view, ${JSON.stringify(groupId)}), "Manual changes under global mode did not persist");
    selectMode(view, "individual");
    check(!isCollapsed(view, null) && isCollapsed(view, ${JSON.stringify(groupId)}) && !isCollapsed(view, ${JSON.stringify(expandedId)}), "Individual mode did not retain manual changes");
  `);
  console.log("Individual collapse and collapse all persisted across plugin reload; open tabs stayed synchronized.");
} finally {
  await runInApp(`${setup}
    await plugin.saveQueue;
    Object.assign(plugin.data, ${JSON.stringify(original)});
    await plugin.saveData(plugin.data);
    for (const leaf of leaves()) leaf.detach();
    app.commands.executeCommandById("plugin-groups-admin:open-plugin-groups");
    for (let attempt = 0; attempt < 40 && leaves().length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  `);
  evaluate("(delete globalThis.__collapsePersistenceTest, true)");
}
