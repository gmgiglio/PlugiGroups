import assert from "node:assert/strict";
import test from "node:test";
import { addGroup, addPluginToGroup, dataFromSaved, groupForPlugin, movePlugin, removeGroup, removePluginFromGroup, renameGroup, setMultipleGroupsAllowed } from "../src/groups";

test("saved data drops duplicate assignments but keeps absent plugin IDs", () => {
  const data = dataFromSaved({ groups: [
    { id: "one", name: " First ", pluginIds: ["a", "a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["a", "b"] },
  ] });
  assert.deepEqual(data.groups, [
    { id: "one", name: "First", pluginIds: ["a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["b"] },
  ]);
  assert.equal(data.allowMultipleGroups, false);
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

test("adding a plugin through a group moves it when multiple groups are off", () => {
  const data = dataFromSaved({ groups: [
    { id: "one", name: "First", pluginIds: ["plugin"] },
    { id: "two", name: "Second", pluginIds: [] },
  ] });
  assert.equal(addPluginToGroup(data, "plugin", "two"), true);
  assert.deepEqual(data.groups.map(group => group.pluginIds), [[], ["plugin"]]);
  assert.equal(addPluginToGroup(data, "plugin", "two"), false);
});

test("multiple group setting keeps memberships across saving and allows individual removal", () => {
  const data = dataFromSaved(null);
  addGroup(data, "Work", "one");
  addGroup(data, "Personal", "two");
  setMultipleGroupsAllowed(data, true);
  assert.equal(addPluginToGroup(data, "plugin", "one"), true);
  assert.equal(addPluginToGroup(data, "plugin", "two"), true);
  assert.equal(addPluginToGroup(data, "plugin", "two"), false);
  assert.deepEqual(dataFromSaved(JSON.parse(JSON.stringify(data))), data);
  assert.equal(removePluginFromGroup(data, "plugin", "one"), true);
  assert.deepEqual(data.groups.map(group => group.pluginIds), [[], ["plugin"]]);
  assert.equal(removePluginFromGroup(data, "plugin", "two"), true);
  assert.equal(groupForPlugin(data, "plugin"), null);
});

test("turning multiple groups off retains the first membership", () => {
  const data = dataFromSaved({ allowMultipleGroups: true, groups: [
    { id: "one", name: "First", pluginIds: ["a", "a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["a", "b"] },
  ] });
  assert.deepEqual(data.groups[1].pluginIds, ["a", "b"]);
  setMultipleGroupsAllowed(data, false);
  assert.deepEqual(data.groups[1].pluginIds, ["b"]);
  assert.deepEqual(dataFromSaved(data), data);
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
