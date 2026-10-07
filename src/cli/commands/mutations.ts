import type { CliData } from "obsidian";
import { addGroup, addPluginToGroup, movePluginToGroup, removeGroup, removePluginFromGroup,
  renameGroup, reorderSection, setCollapseMode, setSectionCollapsed, type Group, type GroupData } from "../../groups/data";
import { pluginsEligibleForGroupToggle, setGroupPluginsEnabled } from "../../groups/toggle";
import { runPluginOperationWithPendingState } from "../../plugins/pendingOperations";
import type { CliContext } from "../types";
import { booleanParameter, cloneGroupData, jsonOutput, requiredParameter, resolveGroup, resolveSection } from "../parameters";
import { dataFromStructure, structureFromData } from "../structure";
import { groupSectionId, UNGROUPED_ID } from "../groups";

export async function createGroup(context: CliContext, params: CliData): Promise<string> {
  const draftData = cloneGroupData(context.data);
  if (!addGroup(draftData, requiredParameter(params, "name"))) throw new Error("Group names must be unique");
  await context.commitData(draftData);
  return draftData.groups[0].id;
}

export async function renameCliGroup(context: CliContext, params: CliData): Promise<string> {
  const draftData = cloneGroupData(context.data);
  const group = resolveGroup(draftData, requiredParameter(params, "group"));
  if (group.id === UNGROUPED_ID) throw new Error("Ungrouped cannot be renamed");
  const name = requiredParameter(params, "name");
  if (group.name !== name && !renameGroup(draftData, group.id, name)) throw new Error("Group names must be unique");
  return commitMutation(context, draftData, `Renamed ${group.id} to ${name}.`);
}

export async function deleteGroup(context: CliContext, params: CliData): Promise<string> {
  const draftData = cloneGroupData(context.data);
  const group = resolveGroup(draftData, requiredParameter(params, "group"));
  if (group.id === UNGROUPED_ID) throw new Error("This group is permanent and cannot be deleted");
  removeGroup(draftData, group.id);
  return commitMutation(context, draftData, `Deleted ${group.id}; plugins remain installed.`);
}

export async function addMembership(context: CliContext, params: CliData): Promise<string> {
  const draftData = cloneGroupData(context.data);
  const group = resolveGroup(draftData, requiredParameter(params, "group"));
  const plugin = installedPluginId(context, params);
  if (group.id === UNGROUPED_ID) movePluginToGroup(draftData, plugin, null);
  else addPluginToGroup(draftData, plugin, group.id);
  return commitMutation(context, draftData, `Added ${plugin} to ${group.id}.`);
}

export async function removeMembership(context: CliContext, params: CliData): Promise<string> {
  const draftData = cloneGroupData(context.data);
  const group = resolveGroup(draftData, requiredParameter(params, "group"), context.getInstalledPlugins());
  const plugin = requiredParameter(params, "plugin");
  if (group.id === UNGROUPED_ID && params.to === undefined) throw new Error("Specify to=<group> to move this plugin to another group");
  if (params.to !== undefined) return removeMembershipToGroup(context, draftData, group, plugin, params);
  removePluginFromGroup(draftData, plugin, group.id);
  return commitMutation(context, draftData, `Removed ${plugin} from ${group.id}.`);
}

async function removeMembershipToGroup(context: CliContext, draftData: GroupData, group: Group, plugin: string, params: CliData): Promise<string> {
  const target = resolveSection(draftData, requiredParameter(params, "to"));
  if (target === groupSectionId(group)) throw new Error("Choose a different destination group");
  if (!group.pluginIds.includes(plugin)) throw new Error(`Plugin ${plugin} is not in this group`);
  if (target !== null) installedPluginId(context, params);
  removePluginFromGroup(draftData, plugin, group.id);
  if (target === null) movePluginToGroup(draftData, plugin, null);
  else addPluginToGroup(draftData, plugin, target);
  return commitMutation(context, draftData, `Moved ${plugin} from ${group.id} to ${target ?? UNGROUPED_ID}.`);
}

export async function moveMembership(context: CliContext, params: CliData): Promise<string> {
  const draftData = cloneGroupData(context.data);
  const id = resolveSection(draftData, requiredParameter(params, "to"));
  const plugin = id === null ? requiredParameter(params, "plugin") : installedPluginId(context, params);
  movePluginToGroup(draftData, plugin, id);
  return commitMutation(context, draftData, `Moved ${plugin} to ${id ?? UNGROUPED_ID}.`);
}

function installedPluginId(context: CliContext, params: CliData): string {
  const id = requiredParameter(params, "plugin");
  if (!context.getInstalledPlugins().some(plugin => plugin.id === id)) throw new Error(`Plugin is not installed: ${id}`);
  return id;
}

export async function reorderCliSection(context: CliContext, params: CliData): Promise<string> {
  const draftData = cloneGroupData(context.data);
  const id = resolveSection(draftData, requiredParameter(params, "group"));
  if ((params.before !== undefined) === (params.after !== undefined)) throw new Error("Specify exactly one of before or after");
  const position = params.before !== undefined ? "before" : "after";
  const target = resolveSection(draftData, requiredParameter(params, position));
  reorderSection(draftData, id, target, position);
  return commitMutation(context, draftData, "Updated section order.");
}

export async function collapseSection(context: CliContext, params: CliData, collapsed: boolean): Promise<string> {
  const draftData = cloneGroupData(context.data);
  const all = booleanParameter(params, "all");
  if (all && params.group !== undefined) throw new Error("Use group or all, not both");
  if (all) setCollapseMode(draftData, collapsed ? "collapsed" : "expanded");
  else setSectionCollapsed(draftData, resolveSection(draftData, requiredParameter(params, "group")), collapsed);
  return commitMutation(context, draftData, collapsed ? "Collapsed section(s)." : "Expanded section(s).");
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
  const draftData = dataFromStructure(context.data, JSON.parse(input) as unknown);
  const dryRun = booleanParameter(params, "dry-run");
  if (!dryRun) await context.commitData(draftData);
  return jsonOutput({ applied: !dryRun, structure: structureFromData(draftData, context.getInstalledPlugins()) });
}

export async function commitMutation(context: CliContext, draftData: GroupData, message: string): Promise<string> {
  await context.commitData(draftData);
  return message;
}
