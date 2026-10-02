import type { Group, GroupData } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { cloneGroupData } from "./parameters";
import { cliGroups, UNGROUPED_ID, UNGROUPED_NAME } from "./groups";

export interface GroupStructure {
  readonly version: 2;
  readonly groups: Group[];
  readonly collapsedGroupIds: string[];
  readonly collapseMode: GroupData["collapseMode"];
  readonly collapseModeExceptionIds: string[];
}

export function structureFromData(data: GroupData, plugins: InstalledPlugin[]): GroupStructure {
  return { version: 2, groups: cliGroups(cloneGroupData(data), plugins),
    collapsedGroupIds: data.collapsedGroupIds.map(id => id ?? UNGROUPED_ID), collapseMode: data.collapseMode,
    collapseModeExceptionIds: data.collapseModeExceptionIds.map(id => id ?? UNGROUPED_ID) };
}

export function dataFromStructure(data: GroupData, input: unknown): GroupData {
  const source = structureRecord(input);
  if (source.version === 1) return dataFromLegacyStructure(data, source);
  requireKeys(source, ["version", "groups", "collapsedGroupIds", "collapseMode", "collapseModeExceptionIds"]);
  if (source.version !== 2) throw new Error("Unsupported structure version; expected 1 or 2");
  const groups = validateStructureGroups(source.groups, data.allowMultipleGroups);
  const next = cloneGroupData(data);
  applyStructureGroups(next, groups);
  next.collapsedGroupIds = validateSectionIds(source.collapsedGroupIds, groups);
  next.collapseMode = validateCollapseMode(source.collapseMode);
  next.collapseModeExceptionIds = validateSectionIds(source.collapseModeExceptionIds, groups);
  return next;
}

function applyStructureGroups(data: GroupData, groups: Group[]): void {
  const ungrouped = groups.find(group => group.id === UNGROUPED_ID);
  if (!ungrouped) throw new Error("The permanent group ungrouped must be included");
  if (ungrouped.name !== UNGROUPED_NAME) throw new Error("Ungrouped cannot be renamed");
  const assigned = new Set(groups.filter(group => group.id !== UNGROUPED_ID).flatMap(group => group.pluginIds));
  if (ungrouped.pluginIds.some(id => assigned.has(id))) throw new Error("A plugin cannot belong to the permanent group and another group");
  data.groups = groups.filter(group => group.id !== UNGROUPED_ID);
  data.ungroupedIndex = groups.indexOf(ungrouped);
}

function structureRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected a JSON object");
  return input as Record<string, unknown>;
}

function requireKeys(source: Record<string, unknown>, keys: string[]): void {
  const unknown = Object.keys(source).find(key => !keys.includes(key));
  if (unknown) throw new Error(`Unknown structure field: ${unknown}`);
  const missing = keys.find(key => !(key in source));
  if (missing) throw new Error(`Missing structure field: ${missing}`);
}

function structureString(input: unknown, field: string): string {
  if (typeof input !== "string" || !input.trim()) throw new Error(`${field} must be a nonempty string`);
  return input.trim();
}

function validateStructureGroups(input: unknown, allowMultiple: boolean): Group[] {
  if (!Array.isArray(input)) throw new Error("groups must be an array");
  const groups = input.map(validateStructureGroup);
  requireUnique(groups.map(group => group.id), "group IDs");
  requireUnique(groups.map(group => group.name.toLocaleLowerCase()), "group names");
  if (!allowMultiple) requireUnique(groups.filter(group => group.id !== UNGROUPED_ID).flatMap(group => group.pluginIds), "memberships; enable allowMultipleGroups first");
  return groups;
}

function validateStructureGroup(input: unknown): Group {
  const source = structureRecord(input);
  requireKeys(source, ["id", "name", "pluginIds"]);
  return { id: structureString(source.id, "Group ID"), name: structureString(source.name, "Group name"),
    pluginIds: validatePluginIds(source.pluginIds) };
}

function validatePluginIds(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error("pluginIds must be an array");
  const ids = input.map(value => structureString(value, "Plugin ID"));
  requireUnique(ids, "plugin IDs");
  return ids;
}

function requireUnique(values: unknown[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${field}`);
}

function validateSectionIds(input: unknown, groups: Group[]): (string | null)[] {
  if (!Array.isArray(input)) throw new Error("Collapse group IDs must be an array");
  const known = new Set(groups.map(group => group.id));
  const ids = input.map((id: unknown) => {
    if (typeof id !== "string" || !known.has(id)) throw new Error("Unknown collapse group ID");
    return id === UNGROUPED_ID ? null : id;
  });
  requireUnique(ids, "collapse group IDs");
  return ids;
}

function validateCollapseMode(input: unknown): GroupData["collapseMode"] {
  if (input !== "individual" && input !== "collapsed" && input !== "expanded") throw new Error("Invalid collapseMode");
  return input;
}

function dataFromLegacyStructure(data: GroupData, source: Record<string, unknown>): GroupData {
  requireKeys(source, ["version", "groups", "ungrouped", "collapsedGroupIds", "collapseMode", "collapseModeExceptionIds"]);
  const groups = validateStructureGroups(source.groups, data.allowMultipleGroups);
  if (groups.some(group => group.id === UNGROUPED_ID)) throw new Error("The group ID ungrouped is reserved in version 1");
  const next = cloneGroupData(data);
  next.groups = groups;
  next.ungroupedIndex = validateLegacyUngrouped(source.ungrouped, groups.length);
  const allGroups = [...groups, { id: UNGROUPED_ID, name: UNGROUPED_NAME, pluginIds: [] }];
  next.collapsedGroupIds = legacySectionIds(source.collapsedGroupIds, allGroups);
  next.collapseMode = validateCollapseMode(source.collapseMode);
  next.collapseModeExceptionIds = legacySectionIds(source.collapseModeExceptionIds, allGroups);
  return next;
}

function validateLegacyUngrouped(input: unknown, count: number): number {
  const source = structureRecord(input);
  requireKeys(source, ["index", "pluginIds"]);
  validatePluginIds(source.pluginIds);
  const index = source.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > count) throw new Error("Invalid Ungrouped index");
  return index;
}

function legacySectionIds(input: unknown, groups: Group[]): (string | null)[] {
  if (!Array.isArray(input)) throw new Error("Collapse group IDs must be an array");
  return validateSectionIds(input.map(id => id ?? UNGROUPED_ID), groups);
}
