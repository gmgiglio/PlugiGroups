import assert from "node:assert/strict";
import test from "node:test";
import type { App } from "obsidian";
import { installedPlugins, inventorySignature, setPluginEnabled } from "../src/inventory";

test("inventory detects installed and enabled plugin changes", () => {
  const manager = {
    manifests: { beta: { name: "Beta", description: "Beta tools", version: "1.0" }, alpha: { name: "Alpha", version: "2.0" } },
    enabledPlugins: new Set(["alpha"]),
  };
  const app = { plugins: manager } as unknown as App;
  const initial = installedPlugins(app);
  assert.deepEqual(initial.map(plugin => [plugin.id, plugin.enabled]), [["alpha", true], ["beta", false]]);
  assert.deepEqual(initial.map(plugin => plugin.description), ["", "Beta tools"]);
  manager.enabledPlugins.add("beta");
  const enabled = installedPlugins(app);
  assert.notEqual(inventorySignature(initial), inventorySignature(enabled));
  manager.manifests.beta.version = "1.1";
  assert.notEqual(inventorySignature(enabled), inventorySignature(installedPlugins(app)));
  const versioned = installedPlugins(app);
  manager.manifests.beta.description = "Updated Beta tools";
  assert.notEqual(inventorySignature(versioned), inventorySignature(installedPlugins(app)));
});

test("enable and disable use Obsidian's saved plugin controls", async () => {
  const enabledPlugins = new Set<string>();
  const calls: string[] = [];
  const manager = {
    manifests: { alpha: { name: "Alpha" } },
    enabledPlugins,
    async enablePluginAndSave(id: string) { calls.push(`enable:${id}`); enabledPlugins.add(id); },
    async disablePluginAndSave(id: string) { calls.push(`disable:${id}`); enabledPlugins.delete(id); },
  };
  const app = { plugins: manager } as unknown as App;
  await setPluginEnabled(app, "alpha", true);
  await setPluginEnabled(app, "alpha", true);
  await setPluginEnabled(app, "alpha", false);
  assert.deepEqual(calls, ["enable:alpha", "disable:alpha"]);
  await assert.rejects(setPluginEnabled(app, "missing", true), /not installed/);
});
