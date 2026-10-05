import assert from "node:assert/strict";
import test from "node:test";
import type { App, EventRef } from "obsidian";
import { pluginInventorySignature } from "../../src/inventory";
import { installedPlugins, uninstallPlugin, installedCommunityPlugins, subscribeToPluginInventoryChanges, setPluginEnabled } from "../../src/pluginApi";

test("inventory detects installed and enabled plugin changes", () => {
  const manager = {
    manifests: { beta: { name: "Beta", description: "Beta tools", version: "1.0", author: "Beta Creator" }, alpha: { name: "Alpha", version: "2.0", author: "" } },
    enabledPlugins: new Set(["alpha"]),
  };
  const app = { plugins: manager } as unknown as App;
  const initial = installedCommunityPlugins(app);
  assert.deepEqual(initial.map(plugin => [plugin.id, plugin.enabled]), [["alpha", true], ["beta", false]]);
  assert.deepEqual(initial.map(plugin => plugin.description), ["", "Beta tools"]);
  assert.deepEqual(initial.map(plugin => plugin.author), ["", "Beta Creator"]);
  manager.enabledPlugins.add("beta");
  const enabled = installedCommunityPlugins(app);
  assert.notEqual(pluginInventorySignature(initial), pluginInventorySignature(enabled));
  manager.manifests.beta.version = "1.1";
  assert.notEqual(pluginInventorySignature(enabled), pluginInventorySignature(installedCommunityPlugins(app)));
  const versioned = installedCommunityPlugins(app);
  manager.manifests.beta.description = "Updated Beta tools";
  assert.notEqual(pluginInventorySignature(versioned), pluginInventorySignature(installedCommunityPlugins(app)));
  const described = installedCommunityPlugins(app);
  manager.manifests.beta.author = "New Creator";
  assert.notEqual(pluginInventorySignature(described), pluginInventorySignature(installedCommunityPlugins(app)));
});

test("enable and disable use Obsidian's saved plugin controls", async () => {
  const enabledPlugins = new Set<string>();
  const calls: string[] = [];
  const manager = {
    manifests: { alpha: { name: "Alpha" } },
    enabledPlugins,
    async enablePluginAndSave(id: string) { calls.push(`enable:${id}`); enabledPlugins.add(id); return true; },
    async disablePluginAndSave(id: string) { calls.push(`disable:${id}`); enabledPlugins.delete(id); },
  };
  const app = { plugins: manager } as unknown as App;
  await setPluginEnabled(app, "alpha", true);
  await setPluginEnabled(app, "alpha", true);
  await setPluginEnabled(app, "alpha", false);
  assert.deepEqual(calls, ["enable:alpha", "disable:alpha"]);
  await assert.rejects(setPluginEnabled(app, "missing", true), /not installed/);
});

test("inventory changes subscribe to the private plugin manager event", () => {
  const calls: string[] = [];
  const eventRef = {} as EventRef;
  let notify: (() => void) | null = null;
  const app = {
    plugins: { on(name: string, callback: () => void) { calls.push(name); notify = callback; return eventRef; } },
  } as unknown as App;
  assert.equal(subscribeToPluginInventoryChanges(app, () => calls.push("changed")), eventRef);
  assert.deepEqual(calls, ["changed"]);
  (notify as (() => void) | null)?.();
  assert.deepEqual(calls, ["changed", "changed"]);
});

test("failed enable is reported to the caller", async () => {
  const app = {
    plugins: {
      manifests: { alpha: { name: "Alpha" } },
      enabledPlugins: new Set<string>(),
      enablePluginAndSave: async () => false,
    },
  } as unknown as App;
  await assert.rejects(setPluginEnabled(app, "alpha", true), /Could not enable/);
});

test("combined inventory keeps colliding IDs distinct and hides internal features", () => {
  const app = { plugins: { manifests: { graph: { name: "Community graph" } }, enabledPlugins: new Set(["graph"]) },
    internalPlugins: { plugins: {
      graph: { instance: { name: "Graph view", description: "Explore connections" }, enabled: false },
      hidden: { instance: { name: "Internal", hiddenFromList: true }, enabled: true },
    } } } as unknown as App;
  const plugins = installedPlugins(app);
  assert.deepEqual(plugins.map(plugin => [plugin.id, plugin.kind, plugin.enabled]),
    [["graph", "community", true], ["core:graph", "core", false]]);
  assert.equal(plugins[1].description, "Explore connections");
});

test("core toggles persist through their own controls and verify the resulting state", async () => {
  const calls: string[] = [];
  const core = { instance: { name: "Graph view" }, enabled: false,
    async enable(save: boolean): Promise<void> { calls.push(`enable:${save}`); core.enabled = true; },
    disable(save: boolean): void { calls.push(`disable:${save}`); core.enabled = false; } };
  const app = { internalPlugins: { plugins: { graph: core } } } as unknown as App;
  await setPluginEnabled(app, "core:graph", true);
  await setPluginEnabled(app, "core:graph", true);
  await setPluginEnabled(app, "core:graph", false);
  assert.deepEqual(calls, ["enable:true", "disable:true"]);
  core.enable = async (): Promise<void> => undefined;
  await assert.rejects(setPluginEnabled(app, "core:graph", true), /Could not change/);
  await assert.rejects(setPluginEnabled(app, "core:missing", true), /not available/);
  await assert.rejects(uninstallPlugin(app, "core:graph"), /cannot be uninstalled/);
});
