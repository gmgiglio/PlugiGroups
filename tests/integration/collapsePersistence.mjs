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
  `);
  console.log("Collapsed and expanded groups persisted across tab reopening and plugin reload; open tabs stayed synchronized.");
} finally {
  await runInApp(`${setup}
    await plugin.saveQueue;
    Object.assign(plugin.data, ${JSON.stringify(original)});
    await plugin.saveData(plugin.data);
    for (const leaf of leaves()) leaf.detach();
    await open();
  `);
  evaluate("(delete globalThis.__collapsePersistenceTest, true)");
}
