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
  const path = join(tmpdir(), `global-search-${randomUUID()}.js`);
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
    globalThis.__globalSearchTest = { done: false, error: null };
    void (async () => { ${code} })().then(
      () => { globalThis.__globalSearchTest.done = true; },
      error => { globalThis.__globalSearchTest = { done: true, error: String(error) }; });
    return true;
  })()`, false);
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = evaluate("globalThis.__globalSearchTest", false);
    if (status?.done) {
      assert.equal(status.error, null);
      return;
    }
    await setTimeout(100);
  }
  assert.fail("Timed out waiting for global search test");
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
    const installed = leaves()[0].view.context.getInstalledPlugins();
    check(installed.length >= 2, "Need two installed plugins");
    const [first, second] = installed;
    const id = crypto.randomUUID();
    plugin.data.groups = [{ id, name: "Search fixture", pluginIds: [first.id] }];
    plugin.data.collapsedGroupIds = [id];
    plugin.data.collapseMode = "individual";
    plugin.data.collapseModeExceptionIds = [];
    const view = await open();
    const container = view.contentEl;
    const searchInput = () => container.querySelector(".plugin-groups-admin-search input");
    const search = value => {
      searchInput().value = value;
      searchInput().dispatchEvent(new Event("input", { bubbles: true }));
    };
    const visibleRows = () => Array.from(container.querySelectorAll(".plugin-groups-admin-plugin"))
      .filter(row => !row.hidden && !row.closest("section").hidden);
    check(!searchInput().closest(".plugin-groups-admin-search").hidden, "Search bar should always be visible");
    check(!container.querySelector(".plugin-groups-admin-search-button"), "Search toggle should be removed");
    container.querySelector(".plugin-groups-admin-add-button").focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", code: "KeyF", ctrlKey: true, bubbles: true, cancelable: true }));
    check(document.activeElement === searchInput(), "Ctrl+F must focus search in the active groups view");
    search("  " + first.id.toUpperCase() + "  ");
    check(container.querySelector(".plugin-groups-admin-collapse-cycle").disabled, "Global search must disable collapse all");
    check(visibleRows().length >= 1 && visibleRows().every(row => row.dataset.pluginSearch.includes(first.id.toLowerCase())), "ID matching should ignore case and surrounding whitespace");
    check(!section(view, id).querySelector(".plugin-groups-admin-section-body").hidden, "Search must reveal collapsed matches");
    check(plugin.data.collapsedGroupIds.includes(id), "Search must preserve saved collapse state");
    searchInput().setSelectionRange(2, 4);
    view.refreshGroupsView();
    check(document.activeElement === searchInput() && searchInput().selectionStart === 2 && searchInput().selectionEnd === 4, "Refresh must preserve search focus and selection");
    check(searchInput().value.includes(first.id.toUpperCase()), "Refresh must preserve query");
    search(second.name);
    check(visibleRows().some(row => row.dataset.pluginSearch.includes(second.id.toLowerCase())), "Search must include ungrouped plugins by name");
    search("no-match-" + crypto.randomUUID());
    check(visibleRows().length === 0 && !container.querySelector(".plugin-groups-admin-search-empty").hidden, "No results must show empty state");
    search("");
    check(!container.querySelector(".plugin-groups-admin-collapse-cycle").disabled, "Clearing search must enable collapse all");
    check(visibleRows().length === installed.length, "Clearing must restore all rows");
    check(section(view, id).querySelector(".plugin-groups-admin-section-body").hidden, "Clearing must restore collapse state");
    search(first.id);
    searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    check(!searchInput().closest(".plugin-groups-admin-search").hidden && document.activeElement === searchInput() && searchInput().value === "", "Escape must clear search while keeping the bar visible and focused");
    check(visibleRows().length === installed.length, "Escape must restore all rows");
    const localInput = () => container.querySelector(".plugin-groups-admin-ungrouped-search input");
    const localButton = () => container.querySelector(".plugin-groups-admin-ungrouped-search-button");
    const localSearch = value => {
      localInput().value = value;
      localInput().dispatchEvent(new Event("input", { bubbles: true }));
    };
    check(!localInput().closest(".plugin-groups-admin-ungrouped-search").hidden, "Ungrouped search is permanently visible");
    localButton().click();
    check(!localInput().closest(".plugin-groups-admin-ungrouped-search").hidden && document.activeElement === localInput(), "Local search button focuses permanent bar");
    localSearch(second.id);
    const localRows = () => Array.from(section(view, null).querySelectorAll(".plugin-groups-admin-plugin")).filter(row => !row.hidden);
    check(localRows().length === 1 && localRows()[0].dataset.pluginSearch.includes(second.id.toLowerCase()), "Local search filters Ungrouped by ID");
    check(!section(view, id).querySelector(".plugin-groups-admin-plugin").hidden, "Local search must leave grouped plugins alone");
    localInput().setSelectionRange(1, 3);
    view.refreshGroupsView();
    check(document.activeElement === localInput() && localInput().selectionStart === 1 && localInput().value === second.id, "Refresh must preserve local query and focus");
    search(first.id);
    check(localRows().length === 0 && section(view, null).hidden, "Global and local searches combine");
    search("");
    localSearch("no-match-" + crypto.randomUUID());
    check(!section(view, null).hidden && !container.querySelector(".plugin-groups-admin-ungrouped-empty").hidden, "Local no-results message stays in Ungrouped");
    localInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    check(!localInput().closest(".plugin-groups-admin-ungrouped-search").hidden && localInput().value === "" && document.activeElement === localInput(), "Escape clears local search and keeps it visible and focused");
    localButton().click();
    localSearch(second.name);
    check(localRows().some(row => row.dataset.pluginSearch.includes(second.id.toLowerCase())), "Local search matches names");
    localButton().click();
    check(document.activeElement === localInput() && localInput().selectionEnd === second.name.length && localRows().length >= 1, "Button selects the query without clearing it");
    check(localButton().textContent === "", "Local search button has no dynamic label");
    check(localInput().closest(".plugin-groups-admin-section-body"), "Ungrouped search must be inside the group body");
    toggle(view, null);
    check(localInput().closest(".plugin-groups-admin-section-body").hidden, "Collapsing Ungrouped must hide its search even with a query");
    check(localInput().value === second.name, "Collapse preserves local search query");
    localButton().click();
    check(!localInput().closest(".plugin-groups-admin-section-body").hidden && document.activeElement === localInput(), "Search icon expands collapsed Ungrouped and focuses its bar");
    localSearch("");
  `);
  console.log("Global search passed: permanent bar, names and IDs, collapsed groups, Ungrouped, live filtering, refresh focus, empty state, clear, and Escape.");
} finally {
  await runInApp(`${setup}
    await plugin.saveQueue;
    Object.assign(plugin.data, ${JSON.stringify(original)});
    await plugin.saveData(plugin.data);
    for (const leaf of leaves()) leaf.detach();
    await open();
  `);
  evaluate("(delete globalThis.__globalSearchTest, true)");
}
