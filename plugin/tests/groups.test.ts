import assert from "node:assert/strict";
import test from "node:test";
import { addGroup, dataFromSaved, groupForPlugin, movePlugin, removeGroup, renameGroup } from "../src/groups";

test("saved data drops duplicate assignments but keeps absent plugin IDs", () => {
  const data = dataFromSaved({ groups: [
    { id: "one", name: " First ", pluginIds: ["a", "a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["a", "b"] },
  ] });
  assert.deepEqual(data.groups, [
    { id: "one", name: "First", pluginIds: ["a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["b"] },
  ]);
});

test("groups accept unique names and moving a plugin gives it one group", () => {
  const data = dataFromSaved(null);
  assert.equal(addGroup(data, "Work", "one"), true);
  assert.equal(addGroup(data, "work", "two"), false);
  assert.equal(addGroup(data, "Personal", "two"), true);
  assert.equal(movePlugin(data, "plugin", "one"), true);
  assert.equal(movePlugin(data, "plugin", "two"), true);
  assert.equal(groupForPlugin(data, "plugin"), "two");
  assert.deepEqual(data.groups[0].pluginIds, []);
  assert.equal(movePlugin(data, "plugin", null), true);
  assert.equal(groupForPlugin(data, "plugin"), null);
});

test("renaming checks duplicates and deleting returns plugins to ungrouped", () => {
  const data = dataFromSaved({ groups: [
    { id: "one", name: "Work", pluginIds: ["plugin"] },
    { id: "two", name: "Personal", pluginIds: [] },
  ] });
  assert.equal(renameGroup(data, "one", "personal"), false);
  assert.equal(renameGroup(data, "one", "Projects"), true);
  assert.equal(removeGroup(data, "one"), true);
  assert.equal(groupForPlugin(data, "plugin"), null);
});
