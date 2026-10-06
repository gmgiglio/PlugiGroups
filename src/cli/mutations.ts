import type { CliData } from "obsidian";
import { addGroup, addPluginToGroup, movePluginToGroup, removeGroup, removePluginFromGroup,
  renameGroup, reorderSection, setCollapseMode, setSectionCollapsed, type Group, type GroupData } from "../groups";
import { pluginsEligibleForGroupToggle, setGroupPluginsEnabled } from "../groupToggle";
import { runPluginOperationWithPendingState } from "../pendingPluginOperations";
import type { CliContext } from "./types";
import { booleanParameter, cloneGroupData, jsonOutput, requiredParameter, resolveGroup, resolveSection } from "./parameters";
import { dataFromStructure, structureFromData } from "./structure";
import { groupSectionId, UNGROUPED_ID } from "./groups";

export async function createGroup(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  if (!addGroup(next, requiredParameter(params, "name"))) throw new Error("Group names must be unique");
  await context.commitData(next);
  return next.groups[0].id;
}

export async function renameCliGroup(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  const group = resolveGroup(next, requiredParameter(params, "group"));
  if (group.id === UNGROUPED_ID) throw new Error("Ungrouped cannot be renamed");
  const name = requiredParameter(params, "name");
  if (group.name !== name && !renameGroup(next, group.id, name)) throw new Error("Group names must be unique");
  return commitMutation(context, next, `Renamed ${group.id} to ${name}.`);
}

export async function deleteGroup(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  const group = resolveGroup(next, requiredParameter(params, "group"));
  if (group.id === UNGROUPED_ID) throw new Error("This group is permanent and cannot be deleted");
  removeGroup(next, group.id);
  return commitMutation(context, next, `Deleted ${group.id}; plugins remain installed.`);
}

export async function addMembership(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  const group = resolveGroup(next, requiredParameter(params, "group"));
  const plugin = installedPluginId(context, params);
  if (group.id === UNGROUPED_ID) movePluginToGroup(next, plugin, null);
  else addPluginToGroup(next, plugin, group.id);
  return commitMutation(context, next, `Added ${plugin} to ${group.id}.`);
}

export async function removeMembership(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  const group = resolveGroup(next, requiredParameter(params, "group"), context.getInstalledPlugins());
  const plugin = requiredParameter(params, "plugin");
  if (group.id === UNGROUPED_ID && params.to === undefined) throw new Error("Specify to=<group> to move this plugin to another group");
  if (params.to !== undefined) return removeMembershipToGroup(context, next, group, plugin, params);
  removePluginFromGroup(next, plugin, group.id);
  return commitMutation(context, next, `Removed ${plugin} from ${group.id}.`);
}

async function removeMembershipToGroup(context: CliContext, next: GroupData, group: Group, plugin: string, params: CliData): Promise<string> {
  const target = resolveSection(next, requiredParameter(params, "to"));
  if (target === groupSectionId(group)) throw new Error("Choose a different destination group");
  if (!group.pluginIds.includes(plugin)) throw new Error(`Plugin ${plugin} is not in this group`);
  if (target !== null) installedPluginId(context, params);
  removePluginFromGroup(next, plugin, group.id);
  if (target === null) movePluginToGroup(next, plugin, null);
  else addPluginToGroup(next, plugin, target);
  return commitMutation(context, next, `Moved ${plugin} from ${group.id} to ${target ?? UNGROUPED_ID}.`);
}

export async function moveMembership(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  const id = resolveSection(next, requiredParameter(params, "to"));
  const plugin = id === null ? requiredParameter(params, "plugin") : installedPluginId(context, params);
  movePluginToGroup(next, plugin, id);
  return commitMutation(context, next, `Moved ${plugin} to ${id ?? UNGROUPED_ID}.`);
}

function installedPluginId(context: CliContext, params: CliData): string {
  const id = requiredParameter(params, "plugin");
  if (!context.getInstalledPlugins().some(plugin => plugin.id === id)) throw new Error(`Plugin is not installed: ${id}`);
  return id;
}

export async function reorderCliSection(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  const id = resolveSection(next, requiredParameter(params, "group"));
  if ((params.before !== undefined) === (params.after !== undefined)) throw new Error("Specify exactly one of before or after");
  const position = params.before !== undefined ? "before" : "after";
  const target = resolveSection(next, requiredParameter(params, position));
  reorderSection(next, id, target, position);
  return commitMutation(context, next, "Updated section order.");
}

export async function collapseSection(context: CliContext, params: CliData, collapsed: boolean): Promise<string> {
  const next = cloneGroupData(context.data);
  const all = booleanParameter(params, "all");
  if (all && params.group !== undefined) throw new Error("Use group or all, not both");
  if (all) setCollapseMode(next, collapsed ? "collapsed" : "expanded");
  else setSectionCollapsed(next, resolveSection(next, requiredParameter(params, "group")), collapsed);
  return commitMutation(context, next, collapsed ? "Collapsed section(s)." : "Expanded section(s).");
}

export async function toggleGroup(context: CliContext, params: CliData, enabled: boolean): Promise<string> {
  const group = resolveGroup(context.data, requiredParameter(params, "group"), context.getInstalledPlugins());
  const installed = context.getInstalledPlugins().filter(plugin => group.pluginIds.includes(plugin.id));
  const plugins = pluginsEligibleForGroupToggle(installed, context.selfId, context.data.unenableablePlugins);
  const changed = await runPluginOperationWithPendingState(context.pendingPluginIds, plugins.map(plugin => plugin.id),
    context.refreshViews, () => setGroupPluginsEnabled(plugins, enabled, context.setPluginEnabled));
  if (!changed) throw new Error("A plugin in this group has a pending operation; retry when it finishes");
  return `${enabled ? "Enabled" : "Disabled"} ${group.name}; PlugiGroups remains enabled.`;
}

export async function replaceStructure(context: CliContext, params: CliData): Promise<string> {
  const input = requiredParameter(params, "json");
  const next = dataFromStructure(context.data, JSON.parse(input) as unknown);
  const dryRun = booleanParameter(params, "dry-run");
  if (!dryRun) await context.commitData(next);
  return jsonOutput({ applied: !dryRun, structure: structureFromData(next, context.getInstalledPlugins()) });
}

export async function commitMutation(context: CliContext, next: GroupData, message: string): Promise<string> {
  await context.commitData(next);
  return message;
}
