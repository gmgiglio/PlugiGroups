import type { CliData, CliFlags } from "obsidian";
import type { CliCommand, CliContext, RegisterCliHandler } from "./types";
import { createGroup, renameCliGroup, deleteGroup, addMembership, removeMembership, moveMembership,
  reorderCliSection, collapseSection, toggleGroup, replaceStructure } from "./mutations";
import { listGroups, showGroup, showUngrouped, searchPlugins, showStructure, filterGroupsViews } from "./queries";
import { readSettings, writeSetting } from "./settings";

const GROUP: CliFlags = { group: { value: "<id-or-name>", description: "Group ID or unambiguous name, including Ungrouped", required: true } };
const PLUGIN: CliFlags = { plugin: { value: "<plugin-id>", description: "Community plugin ID", required: true } };
const NAME: CliFlags = { name: { value: "<name>", description: "Unique group name", required: true } };
const FORMAT: CliFlags = { format: { value: "text|json", description: "Output format (default: text)" } };
const QUERY: CliFlags = { query: { value: "<text>", description: "Plugin name or ID search", required: true } };
const OPTIONAL_GROUP: CliFlags = { group: { ...GROUP.group, required: false } };
const DESTINATION: CliFlags = { to: { value: "<id-or-name>", description: "Destination group, including Ungrouped" } };
const COLLAPSE: CliFlags = { ...OPTIONAL_GROUP, all: { description: "Apply to all groups instead of group" } };

export const CLI_COMMANDS: readonly CliCommand[] = [
  { action: "list", description: "List groups in order with their IDs and counts", flags: FORMAT, run: listGroups },
  { action: "show", description: "Show a group's plugins and enabled states", flags: { ...GROUP, ...FORMAT }, run: showGroup },
  { action: "create", description: "Create a group and return its ID", flags: NAME, run: createGroup },
  { action: "rename", description: "Rename a group (Ungrouped has a fixed name)", flags: { ...GROUP, ...NAME }, run: renameCliGroup },
  { action: "delete", description: "Delete a group; keep its plugins installed (no dialog)", flags: GROUP, run: deleteGroup },
  { action: "add", description: "Add a plugin using the multiple-groups preference", flags: { ...GROUP, ...PLUGIN }, run: addMembership },
  { action: "remove", description: "Remove one membership; to selects a destination (required for Ungrouped)", flags: { ...GROUP, ...PLUGIN, ...DESTINATION }, run: removeMembership },
  { action: "move", description: "Replace a plugin's memberships with one destination", flags: {
    ...PLUGIN, to: { ...DESTINATION.to, required: true } }, run: moveMembership },
  { action: "enable", description: "Enable the installed plugins in a group", flags: GROUP, run: (context, params) => toggleGroup(context, params, true) },
  { action: "disable", description: "Disable a group while keeping PlugiGroups enabled", flags: GROUP, run: (context, params) => toggleGroup(context, params, false) },
  { action: "ungrouped", description: "Shortcut for listing the permanent group's plugins", flags: FORMAT, run: showUngrouped },
  { action: "reorder", description: "Move a section before or after another section", flags: {
    ...GROUP, before: { value: "<group>", description: "Place before this group" },
    after: { value: "<group>", description: "Place after this group" } }, run: reorderCliSection },
  { action: "collapse", description: "Collapse a section or all sections", flags: COLLAPSE, run: (context, params) => collapseSection(context, params, true) },
  { action: "expand", description: "Expand a section or all sections", flags: COLLAPSE, run: (context, params) => collapseSection(context, params, false) },
  { action: "search", description: "Search plugins by name or ID across groups", flags: {
    ...QUERY, ...FORMAT, ...OPTIONAL_GROUP, ungrouped: { description: "Shortcut for group=ungrouped" } }, run: searchPlugins },
  { action: "filter", description: "Set the filter in open PlugiGroups views; query=\"\" clears it", flags: {
    ...QUERY, ...OPTIONAL_GROUP, scope: { value: "all|ungrouped", description: "Legacy scope; prefer group for filtering one group" } }, run: filterGroupsViews },
  { action: "settings", description: "Read all PlugiGroups preferences or one key", flags: {
    key: { value: "<key>", description: "Optional preference key" } }, run: readSettings },
  { action: "setting:set", description: "Set a PlugiGroups preference", flags: {
    key: { value: "<key>", description: "Preference key", required: true },
    value: { value: "<value>", description: "Preference value", required: true } }, run: writeSetting },
  { action: "structure", description: "Show all groups, memberships, order, and collapse state", flags: {
    format: { value: "tree|json", description: "Output format (default: tree)" } }, run: showStructure },
  { action: "structure:set", description: "Replace the full structure from JSON (no dialog)", flags: {
    path: { value: "<path>", description: "JSON file; absolute or relative to the vault" },
    json: { value: "<json>", description: "Inline JSON instead of path" },
    "dry-run": { description: "Validate and preview without saving" } }, run: replaceStructure },
];

export function registerGroupsCli(context: CliContext, register: RegisterCliHandler): void {
  let queue = Promise.resolve();
  for (const command of CLI_COMMANDS) register(`plugiGroups:${command.action}`, command.description, command.flags, params => {
    const result = queue.then(() => command.run(context, validatedCliParameters(command, params)));
    queue = result.then(() => undefined, () => undefined);
    return result;
  });
}

function validatedCliParameters(command: CliCommand, params: CliData): CliData {
  const normalized: CliData = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "--copy" || key === "copy" || key === "vault") continue;
    const bare = key.startsWith("--") ? key.slice(2) : key;
    const flag = Object.prototype.hasOwnProperty.call(command.flags, bare) ? command.flags[bare] : null;
    if (!flag || (key !== bare && flag.value !== undefined)) throw new Error(`Unknown parameter: ${key}`);
    if (normalized[bare] !== undefined) throw new Error(`Specify ${bare} only once`);
    normalized[bare] = value;
  }
  return normalized;
}
