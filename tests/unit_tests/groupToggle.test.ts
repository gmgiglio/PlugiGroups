import assert from "node:assert/strict";
import test from "node:test";
import { groupEnabledState, setGroupPluginsEnabled, pluginsEligibleForGroupToggle } from "../../src/groupToggle";
import type { InstalledPlugin } from "../../src/inventory";

const plugins: InstalledPlugin[] = [
  { id: "self", name: "Admin", description: "", version: "1", author: "", enabled: true },
  { id: "alpha", name: "Alpha", description: "", version: "1", author: "", enabled: true },
  { id: "beta", name: "Beta", description: "", version: "1", author: "", enabled: false },
];

test("group stays enabled while any manageable plugin is enabled", () => {
  const manageable = pluginsEligibleForGroupToggle(plugins, "self");
  assert.deepEqual(manageable.map(plugin => plugin.id), ["alpha", "beta"]);
  assert.equal(groupEnabledState(manageable), "enabled");
  assert.equal(groupEnabledState([{ ...plugins[2], enabled: false }]), "disabled");
  assert.equal(groupEnabledState([{ ...plugins[1], enabled: true }]), "enabled");
  assert.equal(groupEnabledState([]), "disabled");
});

test("group changes run sequentially and skip plugins already in the target state", async () => {
  const calls: string[] = [];
  const change = async (id: string, enabled: boolean): Promise<void> => { calls.push(`${id}:${enabled}`); };
  await setGroupPluginsEnabled(pluginsEligibleForGroupToggle(plugins, "self"), true, change);
  await setGroupPluginsEnabled(pluginsEligibleForGroupToggle(plugins, "self"), false, change);
  assert.deepEqual(calls, ["beta:true", "alpha:false"]);
});
