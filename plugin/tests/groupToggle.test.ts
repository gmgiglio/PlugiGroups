import assert from "node:assert/strict";
import test from "node:test";
import { groupEnabledState, setGroupEnabled, toggleablePlugins } from "../src/groupToggle";
import type { InstalledPlugin } from "../src/inventory";

const plugins: InstalledPlugin[] = [
  { id: "self", name: "Admin", version: "1", enabled: true },
  { id: "alpha", name: "Alpha", version: "1", enabled: true },
  { id: "beta", name: "Beta", version: "1", enabled: false },
];

test("group stays enabled while any manageable plugin is enabled", () => {
  const manageable = toggleablePlugins(plugins, "self");
  assert.deepEqual(manageable.map(plugin => plugin.id), ["alpha", "beta"]);
  assert.equal(groupEnabledState(manageable), "enabled");
  assert.equal(groupEnabledState([{ ...plugins[2], enabled: false }]), "disabled");
  assert.equal(groupEnabledState([{ ...plugins[1], enabled: true }]), "enabled");
  assert.equal(groupEnabledState([]), "disabled");
});

test("group changes run sequentially and skip plugins already in the target state", async () => {
  const calls: string[] = [];
  const change = async (id: string, enabled: boolean): Promise<void> => { calls.push(`${id}:${enabled}`); };
  await setGroupEnabled(toggleablePlugins(plugins, "self"), true, change);
  await setGroupEnabled(toggleablePlugins(plugins, "self"), false, change);
  assert.deepEqual(calls, ["beta:true", "alpha:false"]);
});
