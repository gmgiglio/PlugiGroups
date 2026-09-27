import assert from "node:assert/strict";
import test from "node:test";
import type { App } from "obsidian";
import { openPluginSettings } from "../src/pluginApi";

test("plugin rows open a registered settings tab", () => {
  const calls: string[] = [];
  const app = {
    setting: {
      pluginTabs: [{ id: "alpha" }],
      open: () => calls.push("open"),
      openTabById: (id: string) => calls.push(`tab:${id}`),
    },
  } as unknown as App;
  assert.equal(openPluginSettings(app, "alpha"), "plugin");
  assert.deepEqual(calls, ["open", "tab:alpha"]);
});

test("plugins without a settings tab are revealed in Community plugins", () => {
  const calls: string[] = [];
  const app = {
    setting: {
      pluginTabs: [],
      settingTabs: [{ id: "community-plugins", revealPlugin: (id: string) => calls.push(`reveal:${id}`) }],
      open: () => calls.push("open"),
      openTabById: (id: string) => calls.push(`tab:${id}`),
    },
  } as unknown as App;
  assert.equal(openPluginSettings(app, "beta"), "community");
  assert.deepEqual(calls, ["open", "tab:community-plugins", "reveal:beta"]);
});
