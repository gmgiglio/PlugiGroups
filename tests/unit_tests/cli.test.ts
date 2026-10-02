import assert from "node:assert/strict";
import test from "node:test";
import type { CliData, CliHandler } from "obsidian";
import { normalizeSavedGroupData, type GroupData } from "../../src/groups";
import { CLI_COMMANDS, registerGroupsCli } from "../../src/cli";
import type { CliContext } from "../../src/cli/types";
import { cloneGroupData, resolveGroup } from "../../src/cli/parameters";
import { dataFromStructure, structureFromData } from "../../src/cli/structure";
import type { InstalledPlugin } from "../../src/inventory";

interface Harness {
  readonly context: CliContext;
  readonly handlers: Map<string, CliHandler>;
  readonly saves: GroupData[];
  readonly toggles: string[];
  readonly filters: string[];
}

function createHarness(saved: unknown = null): Harness {
  const saves: GroupData[] = [], toggles: string[] = [], filters: string[] = [];
  const data = normalizeSavedGroupData(saved);
  const plugins = [installedPlugin("alpha", true), installedPlugin("beta", false), installedPlugin("plugin-groups-admin", true)];
  const context: CliContext = { data, selfId: "plugin-groups-admin", pendingPluginIds: new Set(), getInstalledPlugins: () => plugins,
    commitData: async next => { saves.push(cloneGroupData(next)); Object.assign(data, next); }, refreshViews: () => undefined,
    setPluginEnabled: async (id, enabled) => { toggles.push(`${id}:${enabled}`); plugins.find(plugin => plugin.id === id)!.enabled = enabled; },
    filterViews: (query, scope) => { filters.push(`${scope ?? "all"}:${query}`); return 2; } };
  const handlers = new Map<string, CliHandler>();
  registerGroupsCli(context, (name, _description, _flags, handler) => handlers.set(name, handler));
  return { context, handlers, saves, toggles, filters };
}

function installedPlugin(id: string, enabled: boolean): InstalledPlugin {
  return { id, enabled, name: id.toUpperCase(), description: "", version: "1", author: "" };
}

async function run(harness: Harness, action: string, params: CliData = {}): Promise<string> {
  return harness.handlers.get(`plugiGroups:${action}`)!(params);
}

function savedGroups(allowMultipleGroups: boolean = false): unknown {
  return { allowMultipleGroups, groups: [
    { id: "one", name: "Writing", pluginIds: ["alpha", "plugin-groups-admin"] },
    { id: "two", name: "Research", pluginIds: [] },
  ] };
}

test("registers all twenty native commands with the exact public prefix", () => {
  const harness = createHarness();
  assert.equal(harness.handlers.size, 20);
  assert.deepEqual([...harness.handlers.keys()], CLI_COMMANDS.map(command => `plugiGroups:${command.action}`));
  assert.ok(CLI_COMMANDS.every(command => command.description.length > 0));
});

test("group selectors support IDs and unambiguous names, rejecting missing and ambiguous groups", () => {
  const data = normalizeSavedGroupData(savedGroups());
  assert.equal(resolveGroup(data, "writing").id, "one");
  assert.equal(resolveGroup(data, "one").name, "Writing");
  assert.throws(() => resolveGroup(data, "missing"), /Unknown group/);
  data.groups.push({ id: "three", name: "Writing", pluginIds: [] });
  assert.throws(() => resolveGroup(data, "Writing"), /Ambiguous/);
});

test("create, rename and delete save completed mutations and keep memberships on other groups", async () => {
  const harness = createHarness(savedGroups(true));
  const id = await run(harness, "create", { name: "Third" });
  assert.equal(harness.context.data.groups[0].id, id);
  await run(harness, "rename", { group: id, name: "Fourth" });
  await run(harness, "add", { group: id, plugin: "alpha" });
  await run(harness, "delete", { group: "Writing" });
  assert.deepEqual(harness.context.data.groups.find(group => group.id === id)!.pluginIds, ["alpha"]);
  assert.equal(harness.saves.length, 4);
  assert.deepEqual(harness.toggles, []);
});

test("invalid names, selectors and plugin IDs leave saved data untouched", async () => {
  const harness = createHarness(savedGroups());
  const before = cloneGroupData(harness.context.data);
  await assert.rejects(run(harness, "create", { name: "WRITING" }), /unique/);
  await assert.rejects(run(harness, "rename", { group: "one", name: "Research" }), /unique/);
  await assert.rejects(run(harness, "add", { group: "two", plugin: "missing" }), /not installed/);
  await assert.rejects(run(harness, "move", { plugin: "alpha", to: "missing" }), /Unknown group/);
  assert.deepEqual(harness.context.data, before);
  assert.equal(harness.saves.length, 0);
});

test("add respects single membership; move removes every other membership even from the first group", async () => {
  const harness = createHarness(savedGroups());
  await run(harness, "add", { group: "two", plugin: "alpha" });
  assert.deepEqual(harness.context.data.groups[0].pluginIds, ["plugin-groups-admin"]);
  await run(harness, "setting:set", { key: "allowMultipleGroups", value: "true" });
  await run(harness, "add", { group: "one", plugin: "alpha" });
  await run(harness, "move", { plugin: "alpha", to: "one" });
  assert.deepEqual(harness.context.data.groups[1].pluginIds, []);
  await run(harness, "move", { plugin: "alpha", to: "ungrouped" });
  assert.ok(harness.context.data.groups.every(group => !group.pluginIds.includes("alpha")));
});

test("remove can clean missing installed plugins and only affects the selected membership", async () => {
  const harness = createHarness({ allowMultipleGroups: true, groups: [
    { id: "one", name: "First", pluginIds: ["missing"] }, { id: "two", name: "Second", pluginIds: ["missing"] },
  ] });
  await run(harness, "remove", { group: "one", plugin: "missing" });
  assert.deepEqual(harness.context.data.groups.map(group => group.pluginIds), [[], ["missing"]]);
});

test("reordering includes Ungrouped and rejects conflicting or absent targets", async () => {
  const harness = createHarness(savedGroups());
  await run(harness, "reorder", { group: "ungrouped", before: "one" });
  assert.equal(harness.context.data.ungroupedIndex, 0);
  await assert.rejects(run(harness, "reorder", { group: "one", before: "two", after: "ungrouped" }), /exactly one/);
  await assert.rejects(run(harness, "reorder", { group: "one" }), /exactly one/);
  assert.equal(harness.saves.length, 1);
});

test("collapse, expand and global modes retain individual section states", async () => {
  const harness = createHarness(savedGroups());
  await run(harness, "collapse", { group: "one" });
  await run(harness, "collapse", { all: "true" });
  await run(harness, "expand", { group: "ungrouped" });
  assert.deepEqual(harness.context.data.collapseModeExceptionIds, [null]);
  await run(harness, "expand", { all: "true" });
  await run(harness, "setting:set", { key: "collapseMode", value: "individual" });
  assert.deepEqual(harness.context.data.collapsedGroupIds, ["one"]);
  await assert.rejects(run(harness, "collapse", { group: "one", all: "true" }), /not both/);
});

test("group toggles skip self, missing plugins and already-correct states", async () => {
  const harness = createHarness(savedGroups());
  harness.context.data.groups[0].pluginIds.push("missing");
  await run(harness, "disable", { group: "one" });
  await run(harness, "disable", { group: "one" });
  await run(harness, "enable", { group: "one" });
  assert.deepEqual(harness.toggles, ["alpha:false", "alpha:true"]);
  assert.equal(harness.context.getInstalledPlugins().find(plugin => plugin.id === "plugin-groups-admin")!.enabled, true);
  assert.equal(harness.context.pendingPluginIds.size, 0);
});

test("group operations reject overlap and release pending IDs after a plugin failure", async () => {
  const harness = createHarness(savedGroups());
  harness.context.pendingPluginIds.add("alpha");
  await assert.rejects(run(harness, "disable", { group: "one" }), /pending operation/);
  harness.context.pendingPluginIds.clear();
  const broken = { ...harness.context, setPluginEnabled: async (): Promise<void> => { throw new Error("Enable failed"); } };
  registerGroupsCli(broken, (name, _description, _flags, handler) => harness.handlers.set(name, handler));
  await assert.rejects(run(harness, "disable", { group: "one" }), /Enable failed/);
  assert.equal(harness.context.pendingPluginIds.size, 0);
});

test("queries expose states, missing memberships, Ungrouped and name or ID search without saving", async () => {
  const harness = createHarness(savedGroups());
  harness.context.data.groups[0].pluginIds.push("missing");
  const shown = JSON.parse(await run(harness, "show", { group: "one", format: "json" }));
  assert.equal(shown.plugins.at(-1).installed, false);
  assert.equal(shown.plugins.at(-1).enabled, null);
  assert.equal(JSON.parse(await run(harness, "list", { format: "json" }))[0].installed, 2);
  assert.equal(JSON.parse(await run(harness, "ungrouped", { format: "json" }))[0].id, "beta");
  assert.deepEqual(JSON.parse(await run(harness, "search", { query: "ALP", format: "json" }))[0].groupIds, ["one"]);
  assert.deepEqual(JSON.parse(await run(harness, "search", { query: "alpha", ungrouped: "true", format: "json" })), []);
  assert.match(await run(harness, "structure"), /Ungrouped.*\n  BETA/);
  await assert.rejects(run(harness, "list", { format: "xml" }), /format/);
  assert.equal(harness.saves.length, 0);
});

test("view filters accept empty queries and keep the two scopes independent", async () => {
  const harness = createHarness();
  await run(harness, "filter", { query: "alpha" });
  await run(harness, "filter", { query: "", scope: "ungrouped" });
  assert.deepEqual(harness.filters, ["all:alpha", "ungrouped:"]);
  await assert.rejects(run(harness, "filter"), /Missing query/);
  await assert.rejects(run(harness, "filter", { query: "x", scope: "invalid" }), /scope/);
  assert.equal(harness.saves.length, 0);
});

test("preferences validate keys and values and deduplicate memberships when switching to one group", async () => {
  const harness = createHarness(savedGroups(true));
  await run(harness, "add", { group: "two", plugin: "alpha" });
  await run(harness, "setting:set", { key: "allowMultipleGroups", value: "false" });
  assert.deepEqual(harness.context.data.groups[1].pluginIds, []);
  await run(harness, "setting:set", { key: "openLocation", value: "window" });
  assert.equal(JSON.parse(await run(harness, "settings", { key: "openLocation" })), "window");
  await assert.rejects(run(harness, "setting:set", { key: "groups", value: "false" }), /Unknown setting/);
  await assert.rejects(run(harness, "setting:set", { key: "showRibbonButton", value: "yes" }), /true or false/);
  await assert.rejects(run(harness, "setting:set", { key: "openLocation", value: "pane" }), /tab or window/);
});

test("structure round-trips order, IDs, absent memberships, Ungrouped and collapse exceptions without changing preferences", () => {
  const harness = createHarness(savedGroups(true));
  const data = harness.context.data;
  data.ungroupedIndex = 1;
  data.groups[1].pluginIds = ["alpha", "missing"];
  data.collapseMode = "collapsed";
  data.collapseModeExceptionIds = [null];
  const structure = structureFromData(data, harness.context.getInstalledPlugins());
  assert.deepEqual(dataFromStructure(data, structure), data);
  structure.groups.find(group => group.id === "ungrouped")!.pluginIds.push("stale-unassigned-plugin");
  assert.deepEqual(dataFromStructure(data, structure), data);
});

test("structure replacement validates the entire payload before saving, and dry-run never mutates", async () => {
  const harness = createHarness(savedGroups());
  const structure = structureFromData(harness.context.data, harness.context.getInstalledPlugins());
  structure.groups[0].name = "New name";
  const preview = JSON.parse(await run(harness, "structure:set", { json: JSON.stringify(structure), "dry-run": "true" }));
  assert.equal(preview.applied, false);
  assert.equal(harness.context.data.groups[0].name, "Writing");
  assert.equal(harness.saves.length, 0);
  await run(harness, "structure:set", { json: JSON.stringify(structure) });
  assert.equal(harness.context.data.groups[0].name, "New name");
  const before = cloneGroupData(harness.context.data);
  structure.groups[1].id = structure.groups[0].id;
  await assert.rejects(run(harness, "structure:set", { json: JSON.stringify(structure) }), /Duplicate group IDs/);
  assert.deepEqual(harness.context.data, before);
  assert.equal(harness.saves.length, 1);
});

test("structure rejects malformed schema, duplicate names/memberships, bad indices and dangling collapse IDs", () => {
  const harness = createHarness(savedGroups());
  const original = structureFromData(harness.context.data, harness.context.getInstalledPlugins());
  const invalid: unknown[] = [null, [], {}, { ...original, version: 3 }, { ...original, settings: {} },
    { ...original, ungrouped: { index: 9, pluginIds: [] } }, { ...original, collapsedGroupIds: ["missing"] },
    { ...original, collapseMode: "other" }, { ...original, groups: [...original.groups, original.groups[0]] },
    { ...original, groups: original.groups.filter(group => group.id !== "ungrouped") },
    { ...original, groups: [{ ...original.groups[0], pluginIds: ["alpha", "alpha"] }] },
    { ...original, groups: [original.groups[0], { ...original.groups[1], pluginIds: ["alpha"] }] }];
  for (const input of invalid) assert.throws(() => dataFromStructure(harness.context.data, input));
  assert.deepEqual(structureFromData(harness.context.data, harness.context.getInstalledPlugins()), original);
});

test("Ungrouped is listed and shown with the same shape, ID and actual display order as every other group", async () => {
  const harness = createHarness(savedGroups());
  const listed = JSON.parse(await run(harness, "list", { format: "json" }));
  assert.deepEqual(listed.map((group: { id: string }) => group.id), ["one", "two", "ungrouped"]);
  const shown = JSON.parse(await run(harness, "show", { group: "Ungrouped", format: "json" }));
  assert.deepEqual(Object.keys(shown).filter(key => key !== "plugins"), Object.keys(listed[0]));
  assert.equal(shown.permanent, true);
  assert.deepEqual(shown.pluginIds, ["beta"]);
  await run(harness, "reorder", { group: "ungrouped", before: "one" });
  assert.equal(JSON.parse(await run(harness, "list", { format: "json" }))[0].id, "ungrouped");
});

test("Ungrouped has a fixed name and rejects rename and delete without saving", async () => {
  const harness = createHarness(savedGroups());
  const before = cloneGroupData(harness.context.data);
  for (const group of ["Ungrouped", "ungrouped", "UNGROUPED"]) {
    await assert.rejects(run(harness, "rename", { group, name: "Other plugins" }), /cannot be renamed/);
  }
  await assert.rejects(run(harness, "rename", { group: "ungrouped", name: "Ungrouped" }), /cannot be renamed/);
  await assert.rejects(run(harness, "delete", { group: "Ungrouped" }), /permanent/);
  await assert.rejects(run(harness, "create", { name: "Ungrouped" }), /unique/);
  await assert.rejects(run(harness, "rename", { group: "one", name: "Ungrouped" }), /unique/);
  assert.deepEqual(harness.context.data, before);
  assert.equal(harness.saves.length, 0);
});

test("saved custom Ungrouped names are discarded when loading existing data", () => {
  const data = normalizeSavedGroupData({ ...normalizeSavedGroupData(savedGroups()), ungroupedName: "Other plugins" });
  assert.equal("ungroupedName" in data, false);
  assert.equal(resolveGroup(data, "ungrouped").name, "Ungrouped");
});

test("names have ordinary ambiguity checks instead of a reserved Ungrouped selector", () => {
  const data = normalizeSavedGroupData({ groups: [{ id: "legacy", name: "Ungrouped", pluginIds: [] }] });
  assert.throws(() => resolveGroup(data, "Ungrouped"), /Ambiguous/);
  assert.equal(resolveGroup(data, "ungrouped").id, "ungrouped");
  assert.equal(resolveGroup(data, "legacy").id, "legacy");
});

test("adding to Ungrouped clears all memberships and removing with a destination moves it out", async () => {
  const harness = createHarness(savedGroups(true));
  await run(harness, "add", { group: "two", plugin: "alpha" });
  await run(harness, "add", { group: "Ungrouped", plugin: "alpha" });
  assert.ok(harness.context.data.groups.every(group => !group.pluginIds.includes("alpha")));
  await assert.rejects(run(harness, "remove", { group: "ungrouped", plugin: "alpha" }), /to=<group>/);
  await assert.rejects(run(harness, "remove", { group: "ungrouped", plugin: "alpha", to: "ungrouped" }), /different/);
  await run(harness, "remove", { group: "Ungrouped", plugin: "alpha", to: "Writing" });
  assert.deepEqual(harness.context.data.groups[0].pluginIds, ["plugin-groups-admin", "alpha"]);
  await run(harness, "remove", { group: "Writing", plugin: "alpha", to: "Research" });
  assert.deepEqual(harness.context.data.groups[1].pluginIds, ["alpha"]);
});

test("Ungrouped toggles affect its actual plugins, protect self and leave other groups alone", async () => {
  const harness = createHarness({ groups: [{ id: "one", name: "Writing", pluginIds: ["alpha"] }] });
  await run(harness, "enable", { group: "Ungrouped" });
  await run(harness, "disable", { group: "ungrouped" });
  assert.deepEqual(harness.toggles, ["beta:true", "beta:false"]);
  assert.equal(harness.context.getInstalledPlugins().find(plugin => plugin.id === "alpha")!.enabled, true);
  assert.equal(harness.context.getInstalledPlugins().find(plugin => plugin.id === "plugin-groups-admin")!.enabled, true);
});

test("group-based search and filters use the same selectors for every group", async () => {
  const harness = createHarness(savedGroups());
  const result = JSON.parse(await run(harness, "search", { group: "Ungrouped", query: "beta", format: "json" }));
  assert.deepEqual(result[0].groupIds, ["ungrouped"]);
  assert.equal(JSON.parse(await run(harness, "search", { group: "Writing", query: "beta", format: "json" })).length, 0);
  await run(harness, "filter", { group: "Ungrouped", query: "beta" });
  await run(harness, "filter", { group: "Writing", query: "alpha" });
  assert.deepEqual(harness.filters, ["ungrouped:beta", "one:alpha"]);
});

test("structure v2 treats Ungrouped as a permanent group; v1 documents still load", () => {
  const harness = createHarness(savedGroups());
  const structure = structureFromData(harness.context.data, harness.context.getInstalledPlugins());
  const imported = dataFromStructure(harness.context.data, structure);
  assert.equal(resolveGroup(imported, "ungrouped").name, "Ungrouped");
  assert.throws(() => dataFromStructure(imported, { ...structure, groups: structure.groups.filter(group => group.id !== "ungrouped") }), /permanent/);
  const legacy = { version: 1, groups: harness.context.data.groups, ungrouped: { index: 0, pluginIds: [] },
    collapsedGroupIds: [null], collapseMode: "individual", collapseModeExceptionIds: [] };
  const loaded = dataFromStructure(imported, legacy);
  assert.equal(loaded.ungroupedIndex, 0);
  assert.equal(resolveGroup(loaded, "ungrouped").name, "Ungrouped");
  assert.deepEqual(loaded.collapsedGroupIds, [null]);
});

test("structure:set rejects file paths, missing input, and malformed JSON", async () => {
  const harness = createHarness(savedGroups());
  await assert.rejects(run(harness, "structure:set", { path: "groups.json", "dry-run": "true" }), /Unknown parameter: path/);
  await assert.rejects(run(harness, "structure:set", { path: "x", json: "{}" }), /Unknown parameter: path/);
  await assert.rejects(run(harness, "structure:set", {}), /json/);
  await assert.rejects(run(harness, "structure:set", { json: "{" }), /JSON/);
  assert.equal(harness.saves.length, 0);
});

test("the permanent group cannot share memberships even when multiple groups are enabled", () => {
  for (const allowMultiple of [false, true]) {
    const harness = createHarness(savedGroups(allowMultiple));
    const structure = structureFromData(harness.context.data, harness.context.getInstalledPlugins());
    structure.groups.find(group => group.id === "ungrouped")!.pluginIds.push("alpha");
    assert.throws(() => dataFromStructure(harness.context.data, structure), /cannot belong to the permanent group and another group/);
  }
});

test("registered handlers serialize commands and recover after a failed save", async () => {
  const harness = createHarness();
  let fail = true;
  const context = { ...harness.context, commitData: async (next: GroupData): Promise<void> => {
    await Promise.resolve();
    if (fail) { fail = false; throw new Error("Disk write failed"); }
    await harness.context.commitData(next);
  } };
  registerGroupsCli(context, (name, _description, _flags, handler) => harness.handlers.set(name, handler));
  await assert.rejects(run(harness, "create", { name: "Failed" }), /Disk write failed/);
  await Promise.all([run(harness, "create", { name: "First" }), run(harness, "create", { name: "Second" })]);
  assert.deepEqual(harness.context.data.groups.map(group => group.name), ["Second", "First"]);
});

test("unknown parameters cannot accidentally turn a dry-run into a write; dashed boolean aliases work", async () => {
  const harness = createHarness(savedGroups());
  const json = JSON.stringify(structureFromData(harness.context.data, harness.context.getInstalledPlugins()));
  await assert.rejects(run(harness, "structure:set", { json, dryrun: "true" }), /Unknown parameter: dryrun/);
  await run(harness, "structure:set", { json, "--dry-run": "true" });
  await run(harness, "structure", { format: "json", "--copy": "true" });
  await assert.rejects(run(harness, "collapse", { all: "true", "--all": "true" }), /only once/);
  assert.equal(harness.saves.length, 0);
});

test("bulk replacement cannot rename Ungrouped, including in dry-run", async () => {
  const harness = createHarness(savedGroups());
  const before = cloneGroupData(harness.context.data);
  const structure = structureFromData(before, harness.context.getInstalledPlugins());
  structure.groups.find(group => group.id === "ungrouped")!.name = "Other plugins";
  for (const dryRun of ["false", "true"]) {
    await assert.rejects(run(harness, "structure:set", { json: JSON.stringify(structure), "dry-run": dryRun }), /cannot be renamed/);
  }
  assert.deepEqual(harness.context.data, before);
  assert.equal(harness.saves.length, 0);
});
