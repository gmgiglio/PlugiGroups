import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

const pluginId = "plugin-groups-admin";
const viewType = "plugin-groups-admin-view";

function cli(command, ...args) {
  return execFileSync("obsidian", ["vault=testVault_plugiGroups", command, ...args], { encoding: "utf8", timeout: 30000 });
}

function evaluate(expression, expectResult = true) {
  const path = join(tmpdir(), `collapse-layout-${randomUUID()}.js`);
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
    globalThis.__collapseLayoutTest = { done: false, error: null };
    void (async () => { ${code} })().then(
      () => { globalThis.__collapseLayoutTest.done = true; },
      error => { globalThis.__collapseLayoutTest = { done: true, error: String(error) }; });
    return true;
  })()`, false);
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = evaluate("globalThis.__collapseLayoutTest", false);
    if (status?.done) {
      assert.equal(status.error, null);
      return;
    }
    await setTimeout(100);
  }
  assert.fail("Timed out waiting for collapse layout test");
}

const setup = `
  const plugin = app.plugins.plugins[${JSON.stringify(pluginId)}];
  const leaves = () => app.workspace.getLeavesOfType(${JSON.stringify(viewType)});
  const section = (view, id) => view.contentEl.querySelector('[data-group-id="' + (id ?? '') + '"]');
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
    const ids = Array.from({ length: 16 }, () => crypto.randomUUID());
    const pluginIds = Object.keys(app.plugins.manifests).slice(0, 6);
    check(pluginIds.length > 0, "No installed plugins for layout fixtures");
    plugin.data.groups = ids.map((id, index) => ({ id, name: "Layout fixture " + index, pluginIds }));
    plugin.data.ungroupedIndex = ids.length;
    plugin.data.collapsedGroupIds = [];
    const view = await open();
    const container = view.contentEl;
    const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await settle();
    const measure = id => ({
      scroll: container.scrollTop,
      header: section(view, id).querySelector(".plugin-groups-admin-section-header").getBoundingClientRect().top,
      preceding: section(view, id).previousElementSibling.getBoundingClientRect().top,
      following: section(view, id).nextElementSibling?.getBoundingClientRect().top ?? null,
    });
    const cases = [
      { id: ids[2], ungroupedIndex: ids.length, position: 120 },
      { id: null, ungroupedIndex: ids.length, position: 120 },
      { id: null, ungroupedIndex: ids.length, position: container.clientHeight - 80 },
      { id: ids.at(-1), ungroupedIndex: 0, position: 120 },
      { id: ids.at(-1), ungroupedIndex: 0, position: container.clientHeight - 80 },
    ];
    for (const { id, ungroupedIndex, position } of cases) {
      plugin.data.ungroupedIndex = ungroupedIndex;
      view.refreshGroupsView();
      await settle();
      const target = section(view, id);
      container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top - position;
      await settle();
      target.querySelector(".plugin-groups-admin-collapse").focus({ preventScroll: true });
      const before = measure(id);
      check(before.header >= container.getBoundingClientRect().top && before.header < container.getBoundingClientRect().bottom,
        "Fixture header must be visible before collapse");
      toggle(view, id);
      await settle();
      const collapsed = measure(id);
      for (const key of ["scroll", "preceding", "header"]) {
        check(Math.abs(collapsed[key] - before[key]) < 1, "Collapse " + id + " moved " + key + ": " + before[key] + " -> " + collapsed[key]);
      }
      if (before.following !== null) check(collapsed.following < before.following, "Collapsing did not move the following group up");
      toggle(view, id);
      await settle();
      const expanded = measure(id);
      for (const key of Object.keys(before)) {
        if (before[key] === null) continue;
        check(Math.abs(expanded[key] - before[key]) < 1, "Expansion " + id + " moved " + key + ": " + before[key] + " -> " + expanded[key]);
      }
    }
  `);
  console.log("Collapse and expansion kept the section header, preceding content, and scroll position stable, including the last named group and Ungrouped at the top and bottom of the viewport.");
} finally {
  await runInApp(`${setup}
    await plugin.saveQueue;
    Object.assign(plugin.data, ${JSON.stringify(original)});
    await plugin.saveData(plugin.data);
    for (const leaf of leaves()) leaf.detach();
    await open();
  `);
  evaluate("(delete globalThis.__collapseLayoutTest, true)");
}
