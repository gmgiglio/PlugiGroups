import assert from "node:assert/strict";
import test from "node:test";
import { isSectionCollapsed, setSectionCollapsed, setCollapseMode } from "../../src/groups";
import { addGroup, addPluginToGroup, normalizeSavedGroupData, firstGroupIdForPlugin, movePluginToGroup, removeGroup, removePluginFromGroup, renameGroup, reorderSection, orderedSectionIdsIncludingUngrouped, setMultipleGroupsAllowed } from "../../src/groups";

test("reordering groups preserves memberships and persists the new order", () => {
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: "First", pluginIds: ["a"] },
    { id: "two", name: "Second", pluginIds: ["b"] },
    { id: "three", name: "Third", pluginIds: ["c"] },
  ] });
  assert.equal(reorderSection(data, "one", "three", "after"), true);
  assert.deepEqual(data.groups.map(group => group.id), ["two", "three", "one"]);
  assert.equal(reorderSection(data, "one", "two", "before"), true);
  assert.deepEqual(normalizeSavedGroupData(JSON.parse(JSON.stringify(data))).groups, data.groups);
  assert.equal(reorderSection(data, "one", "two", "before"), false);
  assert.equal(reorderSection(data, "missing", "two", "after"), false);
  assert.equal(reorderSection(data, "one", "one", "after"), false);
});

test("Ungrouped moves between named groups and keeps its position across changes", () => {
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: "First", pluginIds: ["a"] },
    { id: "two", name: "Second", pluginIds: ["b"] },
  ] });
  assert.deepEqual(orderedSectionIdsIncludingUngrouped(data), ["one", "two", null]);
  assert.equal(reorderSection(data, null, "two", "before"), true);
  assert.deepEqual(orderedSectionIdsIncludingUngrouped(data), ["one", null, "two"]);
  assert.equal(reorderSection(data, "two", null, "before"), true);
  assert.deepEqual(orderedSectionIdsIncludingUngrouped(data), ["one", "two", null]);
  assert.equal(reorderSection(data, null, "one", "before"), true);
  assert.deepEqual(orderedSectionIdsIncludingUngrouped(normalizeSavedGroupData(JSON.parse(JSON.stringify(data)))), [null, "one", "two"]);
  assert.equal(addGroup(data, "Third", "three"), true);
  assert.deepEqual(orderedSectionIdsIncludingUngrouped(data), ["three", null, "one", "two"]);
  assert.equal(removeGroup(data, "one"), true);
  assert.deepEqual(orderedSectionIdsIncludingUngrouped(data), ["three", null, "two"]);
  assert.deepEqual(data.groups.map(group => group.pluginIds), [[], ["b"]]);
});

test("saved data drops duplicate assignments but keeps absent plugin IDs", () => {
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: " First ", pluginIds: ["a", "a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["a", "b"] },
  ] });
  assert.deepEqual(data.groups, [
    { id: "one", name: "First", pluginIds: ["a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["b"] },
  ]);
  assert.equal(data.allowMultipleGroups, false);
});

test("ribbon button stays visible for existing data and respects a saved toggle", () => {
  assert.equal(normalizeSavedGroupData(null).showRibbonButton, true);
  assert.equal(normalizeSavedGroupData({ groups: [] }).showRibbonButton, true);
  assert.equal(normalizeSavedGroupData({ groups: [], showRibbonButton: false }).showRibbonButton, false);
});

test("open location defaults to a tab and preserves the window preference across reloads", () => {
  for (const value of [null, { groups: [] }, { openLocation: "invalid" }, { openLocation: true }]) {
    assert.equal(normalizeSavedGroupData(value).openLocation, "tab");
  }
  const data = normalizeSavedGroupData({ openLocation: "window" });
  assert.equal(data.openLocation, "window");
  assert.equal(normalizeSavedGroupData(JSON.parse(JSON.stringify(data))).openLocation, "window");
});

test("groups accept unique names and moving a plugin gives it one group", () => {
  const data = normalizeSavedGroupData(null);
  assert.equal(addGroup(data, "Work", "one"), true);
  assert.equal(addGroup(data, "work", "two"), false);
  assert.equal(addGroup(data, "Personal", "two"), true);
  assert.equal(movePluginToGroup(data, "plugin", "one"), true);
  assert.equal(movePluginToGroup(data, "plugin", "two"), true);
  assert.equal(firstGroupIdForPlugin(data, "plugin"), "two");
  assert.deepEqual(data.groups.find(group => group.id === "one")!.pluginIds, []);
  assert.equal(movePluginToGroup(data, "plugin", null), true);
  assert.equal(firstGroupIdForPlugin(data, "plugin"), null);
});

test("groups generate an ID when none is supplied", () => {
  const data = normalizeSavedGroupData(null);
  assert.equal(addGroup(data, "Work"), true);
  assert.equal(addGroup(data, "Personal", ""), true);
  assert.ok(data.groups[0].id);
  assert.ok(data.groups[1].id);
  assert.notEqual(data.groups[0].id, data.groups[1].id);
  assert.equal(addGroup(data, "Another", data.groups[0].id), false);
});

test("adding a plugin through a group moves it when multiple groups are off", () => {
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: "First", pluginIds: ["plugin"] },
    { id: "two", name: "Second", pluginIds: [] },
  ] });
  assert.equal(addPluginToGroup(data, "plugin", "two"), true);
  assert.deepEqual(data.groups.map(group => group.pluginIds), [[], ["plugin"]]);
  assert.equal(addPluginToGroup(data, "plugin", "two"), false);
});

test("multiple group setting keeps memberships across saving and allows individual removal", () => {
  const data = normalizeSavedGroupData(null);
  addGroup(data, "Work", "one");
  addGroup(data, "Personal", "two");
  setMultipleGroupsAllowed(data, true);
  assert.equal(addPluginToGroup(data, "plugin", "one"), true);
  assert.equal(addPluginToGroup(data, "plugin", "two"), true);
  assert.equal(addPluginToGroup(data, "plugin", "two"), false);
  assert.deepEqual(normalizeSavedGroupData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(removePluginFromGroup(data, "plugin", "one"), true);
  assert.deepEqual(data.groups.map(group => group.pluginIds), [["plugin"], []]);
  assert.equal(removePluginFromGroup(data, "plugin", "two"), true);
  assert.equal(firstGroupIdForPlugin(data, "plugin"), null);
});

test("turning multiple groups off retains the first membership", () => {
  const data = normalizeSavedGroupData({ allowMultipleGroups: true, groups: [
    { id: "one", name: "First", pluginIds: ["a", "a", "missing"] },
    { id: "two", name: "Second", pluginIds: ["a", "b"] },
  ] });
  assert.deepEqual(data.groups[1].pluginIds, ["a", "b"]);
  setMultipleGroupsAllowed(data, false);
  assert.deepEqual(data.groups[1].pluginIds, ["b"]);
  assert.deepEqual(normalizeSavedGroupData(data), data);
});

test("renaming checks duplicates and deleting returns plugins to ungrouped", () => {
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: "Work", pluginIds: ["plugin"] },
    { id: "two", name: "Personal", pluginIds: [] },
  ] });
  assert.equal(renameGroup(data, "one", "personal"), false);
  assert.equal(renameGroup(data, "one", "Projects"), true);
  assert.equal(removeGroup(data, "one"), true);
  assert.equal(firstGroupIdForPlugin(data, "plugin"), null);
});


test("collapse state defaults to expanded and validates saved section IDs", () => {
  assert.deepEqual(normalizeSavedGroupData(null).collapsedGroupIds, []);
  assert.deepEqual(normalizeSavedGroupData({ groups: [] }).collapsedGroupIds, []);
  assert.deepEqual(normalizeSavedGroupData({ collapsedGroupIds: "one" }).collapsedGroupIds, []);
  const data = normalizeSavedGroupData({
    groups: [{ id: "one", name: "First", pluginIds: [] }, { id: "two", name: "Second", pluginIds: [] }],
    collapsedGroupIds: ["one", null, "one", null, "missing", 123, {}, false],
  });
  assert.deepEqual(data.collapsedGroupIds, ["one", null]);
  assert.deepEqual(normalizeSavedGroupData(JSON.parse(JSON.stringify(data))).collapsedGroupIds, ["one", null]);
  renameGroup(data, "one", "Renamed");
  reorderSection(data, "one", "two", "after");
  assert.deepEqual(data.collapsedGroupIds, ["one", null]);
  removeGroup(data, "one");
  assert.deepEqual(data.collapsedGroupIds, [null]);
});

test("collapse all preserves individual states across reload and group changes", () => {
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: "First", pluginIds: [] },
    { id: "two", name: "Second", pluginIds: [] },
  ], collapsedGroupIds: ["one", null] });
  data.collapseMode = "collapsed";
  const reloaded = normalizeSavedGroupData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(reloaded.collapsedGroupIds, ["one", null]);
  assert.equal(reloaded.collapseMode, "collapsed");
  removeGroup(reloaded, "one");
  addGroup(reloaded, "Third", "three");
  reloaded.collapseMode = "individual";
  assert.deepEqual(reloaded.collapsedGroupIds, [null]);
  assert.equal(reloaded.collapseMode, "individual");
});

test("collapse all defaults off and migrates the old snapshot without losing individual states", () => {
  assert.equal(normalizeSavedGroupData(null).collapseMode, "individual");
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: "First", pluginIds: [] },
    { id: "two", name: "Second", pluginIds: [] },
  ], collapsedGroupIds: ["one", "two", null], previousCollapsedGroupIds: ["one", "missing", null] });
  assert.equal(data.collapseMode, "collapsed");
  assert.deepEqual(data.collapsedGroupIds, ["one", null]);
  assert.equal("previousCollapsedGroupIds" in data, false);
  data.collapseMode = "individual";
  assert.deepEqual(data.collapsedGroupIds, ["one", null]);
  assert.equal(data.collapseMode, "individual");
});

test("manual changes preserve the global mode, affect only that group, and persist", () => {
  const data = normalizeSavedGroupData({ groups: [
    { id: "one", name: "First", pluginIds: [] },
    { id: "two", name: "Second", pluginIds: [] },
  ], collapsedGroupIds: ["one", null], collapseMode: "collapsed" });
  setSectionCollapsed(data, "one", false);
  assert.equal(data.collapseMode, "collapsed");
  assert.equal(isSectionCollapsed(data, "one"), false);
  assert.equal(isSectionCollapsed(data, "two"), true);
  const reloaded = normalizeSavedGroupData(JSON.parse(JSON.stringify(data)));
  assert.equal(isSectionCollapsed(reloaded, "one"), false);
  assert.equal(reloaded.collapseMode, "collapsed");
  setCollapseMode(reloaded, "expanded");
  assert.deepEqual(reloaded.collapseModeExceptionIds, []);
  setSectionCollapsed(reloaded, "two", true);
  assert.equal(reloaded.collapseMode, "expanded");
  assert.equal(isSectionCollapsed(reloaded, "two"), true);
  assert.equal(isSectionCollapsed(reloaded, null), false);
  setCollapseMode(reloaded, "individual");
  assert.deepEqual(reloaded.collapsedGroupIds, [null, "two"]);
  assert.equal(isSectionCollapsed(reloaded, "one"), false);
  assert.equal(isSectionCollapsed(reloaded, "two"), true);
});

test("manual exceptions validate saved IDs and are removed with deleted groups", () => {
  const data = normalizeSavedGroupData({ groups: [{ id: "one", name: "First", pluginIds: [] }],
    collapseModeExceptionIds: ["one", "one", null, "missing", 123] });
  assert.deepEqual(data.collapseModeExceptionIds, ["one", null]);
  removeGroup(data, "one");
  assert.deepEqual(data.collapseModeExceptionIds, [null]);
  assert.equal(normalizeSavedGroupData({ collapseAll: true }).collapseMode, "collapsed");
});
