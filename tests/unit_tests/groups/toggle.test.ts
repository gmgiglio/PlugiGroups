import assert from "node:assert/strict";
import test from "node:test";
import { enableOnlyGroupPlugins, groupEnabledState, groupStateAfterChange, nextGroupEnabledIds, pluginsEligibleForGroupToggle, rememberGroupMix, rememberMixesOfGroupsContaining, setGroupPluginsEnabled } from "../../../src/groups/toggle";
import type { Group } from "../../../src/groups/data";
import type { InstalledPlugin } from "../../../src/plugins/inventory";

const plugins: InstalledPlugin[] = [
  { id: "self", name: "Admin", kind: "community", description: "", version: "1", author: "", enabled: true },
  { id: "alpha", name: "Alpha", kind: "community", description: "", version: "1", author: "", enabled: true },
  { id: "beta", name: "Beta", kind: "community", description: "", version: "1", author: "", enabled: false },
];

test("group is partial when only some manageable plugins are enabled", () => {
  const manageable = pluginsEligibleForGroupToggle(plugins, "self", {});
  assert.deepEqual(manageable.map(plugin => plugin.id), ["alpha", "beta"]);
  assert.equal(groupEnabledState(manageable), "partial");
  assert.equal(groupEnabledState([{ ...plugins[2], enabled: false }]), "disabled");
  assert.equal(groupEnabledState([{ ...plugins[1], enabled: true }]), "enabled");
  assert.equal(groupEnabledState([{ ...plugins[1], enabled: true }, { ...plugins[2], enabled: true }]), "enabled");
  assert.equal(groupEnabledState([]), "disabled");
});

test("group changes run sequentially and skip plugins already in the target state", async () => {
  const calls: string[] = [];
  const change = async (id: string, enabled: boolean): Promise<void> => { calls.push(`${id}:${enabled}`); };
  await setGroupPluginsEnabled(pluginsEligibleForGroupToggle(plugins, "self", {}), true, change);
  await setGroupPluginsEnabled(pluginsEligibleForGroupToggle(plugins, "self", {}), false, change);
  assert.deepEqual(calls, ["beta:true", "alpha:false"]);
});

test("group switch cycles from the saved mix to all on to all off and back to the mix", () => {
  const group: Group = { id: "g", name: "Group", pluginIds: ["alpha", "beta"] };
  const manageable = pluginsEligibleForGroupToggle(plugins, "self", {});
  assert.deepEqual(nextGroupEnabledIds(group, manageable), ["alpha", "beta"]);
  rememberGroupMix(group, manageable);
  assert.deepEqual(group.savedMixPluginIds, ["alpha"]);
  const allOn = manageable.map(plugin => ({ ...plugin, enabled: true }));
  assert.deepEqual(nextGroupEnabledIds(group, allOn), []);
  const allOff = manageable.map(plugin => ({ ...plugin, enabled: false }));
  assert.deepEqual(nextGroupEnabledIds(group, allOff), ["alpha"]);
});

test("group switch turns everything on from off when no saved mix applies", () => {
  const allOff = pluginsEligibleForGroupToggle(plugins, "self", {}).map(plugin => ({ ...plugin, enabled: false }));
  assert.deepEqual(nextGroupEnabledIds({ id: "g", name: "Group", pluginIds: [] }, allOff), ["alpha", "beta"]);
  assert.deepEqual(nextGroupEnabledIds({ id: "g", name: "Group", pluginIds: [], savedMixPluginIds: ["gone"] }, allOff), ["alpha", "beta"]);
});

test("plugins Obsidian refused to enable are left out of the group switch until their version changes", () => {
  const refused = { beta: "1" };
  assert.deepEqual(pluginsEligibleForGroupToggle(plugins, "self", refused).map(plugin => plugin.id), ["alpha"]);
  assert.equal(groupEnabledState(pluginsEligibleForGroupToggle(plugins, "self", refused)), "enabled");
  assert.deepEqual(pluginsEligibleForGroupToggle(plugins, "self", { beta: "0.9" }).map(plugin => plugin.id), ["alpha", "beta"]);
});

test("group switch skips the middle step when the saved mix matches every plugin", () => {
  const group: Group = { id: "g", name: "Group", pluginIds: ["alpha", "beta"], savedMixPluginIds: ["alpha"] };
  const allOff = pluginsEligibleForGroupToggle(plugins, "self", { beta: "1" }).map(plugin => ({ ...plugin, enabled: false }));
  assert.deepEqual(nextGroupEnabledIds(group, allOff), ["alpha"]);
  assert.equal(groupEnabledState(allOff.map(plugin => ({ ...plugin, enabled: true }))), "enabled");
});

test("group changes continue past a plugin that fails and then report the failure", async () => {
  const calls: string[] = [];
  const change = async (id: string, enabled: boolean): Promise<void> => {
    calls.push(`${id}:${enabled}`);
    if (id === "alpha") throw new Error("refused");
  };
  const allOff = pluginsEligibleForGroupToggle(plugins, "self", {}).map(plugin => ({ ...plugin, enabled: false }));
  await assert.rejects(enableOnlyGroupPlugins(allOff, ["alpha", "beta"], change), /refused/);
  assert.deepEqual(calls, ["alpha:true", "beta:true"]);
});

test("changing one plugin replaces the saved mix, and making the group uniform forgets it", () => {
  const group: Group = { id: "g", name: "Group", pluginIds: ["self", "alpha", "beta"], savedMixPluginIds: ["beta"] };
  const other: Group = { id: "o", name: "Other", pluginIds: ["self"], savedMixPluginIds: ["self"] };
  rememberMixesOfGroupsContaining([group, other], "alpha", plugins, "self", {});
  assert.deepEqual(group.savedMixPluginIds, ["alpha"]);
  assert.deepEqual(other.savedMixPluginIds, ["self"]);
  const allOn = plugins.map(plugin => ({ ...plugin, enabled: true }));
  rememberMixesOfGroupsContaining([group], "beta", allOn, "self", {});
  assert.equal("savedMixPluginIds" in group, false);
  const allOff = pluginsEligibleForGroupToggle(allOn, "self", {}).map(plugin => ({ ...plugin, enabled: false }));
  assert.deepEqual(nextGroupEnabledIds(group, allOff), ["alpha", "beta"]);
});

test("group target state describes the plugins after a change", () => {
  const manageable = pluginsEligibleForGroupToggle(plugins, "self", {});
  assert.equal(groupStateAfterChange(manageable, ["alpha", "beta"]), "enabled");
  assert.equal(groupStateAfterChange(manageable, ["beta"]), "partial");
  assert.equal(groupStateAfterChange(manageable, []), "disabled");
});
