import assert from "node:assert/strict";
import test from "node:test";
import type { App, EventRef } from "obsidian";
import { inventorySignature } from "../src/inventory";
import type { InstalledPlugin } from "../src/inventory";
import { registerInventoryRefresh } from "../src/inventoryRefresh";
import type { InventoryRefreshEvents } from "../src/inventoryRefresh";
import { installedPlugins } from "../src/pluginApi";

interface FakeManager {
  manifests: Record<string, { name: string; version?: string }>;
  enabledPlugins: Set<string>;
  on?: (name: "changed", callback: () => void) => EventRef;
}

interface RefreshHarness {
  manager: FakeManager;
  rendered: InstalledPlugin[][];
  views: { refresh: () => void }[];
  registeredEvents: EventRef[];
  fire: (event: string) => void;
}

function lastRendered(harness: RefreshHarness): InstalledPlugin[] {
  const plugins = harness.rendered[harness.rendered.length - 1];
  assert.ok(plugins, "expected the tab to refresh");
  return plugins;
}

function createManager(listeners: Map<string, () => void>, withManagerEvent: boolean): FakeManager {
  const manager: FakeManager = { manifests: { alpha: { name: "Alpha" } }, enabledPlugins: new Set() };
  if (withManagerEvent) manager.on = (name, callback) => {
    listeners.set(name, callback);
    return {} as EventRef;
  };
  return manager;
}

function createEvents(listeners: Map<string, () => void>, registeredEvents: EventRef[]): InventoryRefreshEvents {
  return {
    registerEvent: event => { registeredEvents.push(event); },
    onLayoutChange: callback => { listeners.set("layout-change", callback); return {} as EventRef; },
    onFocus: callback => { listeners.set("focus", callback); },
    onVisibilityChange: callback => { listeners.set("visibilitychange", callback); },
  };
}

function createRefreshHarness(withManagerEvent = true): RefreshHarness {
  const listeners = new Map<string, () => void>();
  const manager = createManager(listeners, withManagerEvent);
  const registeredEvents: EventRef[] = [];
  const rendered: InstalledPlugin[][] = [];
  const app = { plugins: manager } as unknown as App;
  const views = [{ refresh: () => { rendered.push(installedPlugins(app)); } }];
  registerInventoryRefresh({ app, lastInventory: inventorySignature(installedPlugins(app)), views: () => views }, createEvents(listeners, registeredEvents));
  return {
    manager, rendered, views, registeredEvents,
    fire: event => {
      const callback = listeners.get(event);
      assert.ok(callback, `missing ${event} listener`);
      callback();
    },
  };
}

test("manager changes refresh enabled state once", () => {
  const harness = createRefreshHarness();
  assert.equal(harness.registeredEvents.length, 2);
  harness.fire("focus");
  assert.equal(harness.rendered.length, 0);

  harness.manager.enabledPlugins.add("alpha");
  harness.fire("changed");
  assert.deepEqual(lastRendered(harness).map(plugin => [plugin.id, plugin.enabled]), [["alpha", true]]);
  harness.fire("focus");
  harness.fire("layout-change");
  assert.equal(harness.rendered.length, 1);
  harness.manager.enabledPlugins.delete("alpha");
  harness.fire("changed");
  assert.equal(lastRendered(harness)[0].enabled, false);
  assert.equal(harness.rendered.length, 2);
});

test("layout and focus catch missed installs and uninstalls", () => {
  const harness = createRefreshHarness();
  harness.manager.manifests.beta = { name: "Beta" };
  harness.fire("layout-change");
  assert.deepEqual(lastRendered(harness).map(plugin => plugin.id), ["alpha", "beta"]);
  harness.fire("changed");
  assert.equal(harness.rendered.length, 1);

  delete harness.manager.manifests.alpha;
  harness.manager.enabledPlugins.delete("alpha");
  harness.fire("focus");
  assert.deepEqual(lastRendered(harness).map(plugin => plugin.id), ["beta"]);
  assert.equal(harness.rendered.length, 2);
});

test("visibility catches metadata changes when the private manager event is unavailable", () => {
  const harness = createRefreshHarness(false);
  assert.equal(harness.registeredEvents.length, 1);
  harness.manager.manifests.alpha.version = "2.0";
  harness.fire("visibilitychange");
  assert.equal(lastRendered(harness)[0].version, "2.0");
  harness.fire("visibilitychange");
  harness.fire("layout-change");
  assert.equal(harness.rendered.length, 1);
});

test("closed tabs are skipped and each open tab refreshes once on the next change", () => {
  const harness = createRefreshHarness();
  const firstView = harness.views.pop();
  assert.ok(firstView);
  harness.manager.enabledPlugins.add("alpha");
  harness.fire("focus");
  assert.equal(harness.rendered.length, 0);

  harness.views.push(firstView, { refresh: () => { harness.rendered.push([]); } });
  harness.fire("layout-change");
  assert.equal(harness.rendered.length, 0);
  harness.manager.manifests.beta = { name: "Beta" };
  harness.fire("layout-change");
  assert.equal(harness.rendered.length, 2);
  harness.fire("focus");
  assert.equal(harness.rendered.length, 2);
});
