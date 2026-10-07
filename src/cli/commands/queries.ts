import type { CliData } from "obsidian";
import { isSectionCollapsed, type Group } from "../../groups/data";
import type { InstalledPlugin } from "../../plugins/inventory";
import type { CliContext } from "../types";
import { jsonOutput, outputFormat, requiredParameter, resolveGroup, booleanParameter } from "../parameters";
import { structureFromData } from "../structure";
import { cliGroups, groupSectionId, UNGROUPED_ID, ungroupedPluginIds } from "../groups";

export function listGroups(context: CliContext, params: CliData): string {
  const groups = cliGroups(context.data, context.getInstalledPlugins()).map(group => groupSummary(context, group));
  return outputFormat(params, "text") === "json" ? jsonOutput(groups)
    : groups.map(group => `${group.id}\t${group.name}\t${group.enabled}/${group.installed} enabled\t${group.collapsed ? "collapsed" : "expanded"}`).join("\n");
}

interface GroupSummary {
  readonly id: string;
  readonly name: string;
  readonly pluginIds: string[];
  readonly enabled: number;
  readonly installed: number;
  readonly collapsed: boolean;
  readonly permanent: boolean;
}

function groupSummary(context: CliContext, group: Group): GroupSummary {
  const plugins = context.getInstalledPlugins().filter(plugin => group.pluginIds.includes(plugin.id));
  return { id: group.id, name: group.name, pluginIds: [...group.pluginIds], installed: plugins.length,
    enabled: plugins.filter(plugin => plugin.enabled).length, collapsed: isSectionCollapsed(context.data, groupSectionId(group)),
    permanent: group.id === UNGROUPED_ID };
}

export function showGroup(context: CliContext, params: CliData): string {
  const group = resolveGroup(context.data, requiredParameter(params, "group"), context.getInstalledPlugins());
  const plugins = group.pluginIds.map(id => describePlugin(context, id));
  return outputFormat(params, "text") === "json" ? jsonOutput({ ...groupSummary(context, group), plugins })
    : [group.name, ...plugins.map(plugin => `  ${pluginLabel(plugin)}`)].join("\n");
}

interface PluginDescription {
  readonly id: string;
  readonly name: string;
  readonly installed: boolean;
  readonly enabled: boolean | null;
}

function describePlugin(context: CliContext, id: string): PluginDescription {
  const plugin = context.getInstalledPlugins().find(plugin => plugin.id === id);
  return { id, name: plugin?.name ?? id, installed: plugin !== undefined, enabled: plugin?.enabled ?? null };
}

function pluginLabel(plugin: PluginDescription): string {
  const state = !plugin.installed ? "not installed" : plugin.enabled ? "enabled" : "disabled";
  return `${plugin.name} (${plugin.id}) [${state}]`;
}

export function showUngrouped(context: CliContext, params: CliData): string {
  const plugins = ungroupedPluginIds(context.data, context.getInstalledPlugins()).map(id => describePlugin(context, id));
  return outputFormat(params, "text") === "json" ? jsonOutput(plugins) : plugins.map(pluginLabel).join("\n");
}

export function searchPlugins(context: CliContext, params: CliData): string {
  const query = requiredParameter(params, "query").toLocaleLowerCase();
  const onlyUngrouped = booleanParameter(params, "ungrouped");
  if (onlyUngrouped && params.group !== undefined) throw new Error("Use group or ungrouped, not both");
  const selected = onlyUngrouped ? UNGROUPED_ID : params.group === undefined ? null : resolveGroup(context.data, requiredParameter(params, "group")).id;
  const plugins = context.getInstalledPlugins().filter(plugin => matchesPluginSearch(plugin, query));
  const matches = plugins.map(plugin => searchResult(context, plugin)).filter(plugin => selected === null || plugin.groupIds.includes(selected));
  return outputFormat(params, "text") === "json" ? jsonOutput(matches)
    : matches.map(plugin => `${pluginLabel(plugin)}\t${plugin.groupIds.join(", ") || "Ungrouped"}`).join("\n");
}

function matchesPluginSearch(plugin: InstalledPlugin, query: string): boolean {
  return plugin.name.toLocaleLowerCase().includes(query) || plugin.id.toLocaleLowerCase().includes(query);
}

function searchResult(context: CliContext, plugin: InstalledPlugin): PluginDescription & { readonly groupIds: string[] } {
  return { ...describePlugin(context, plugin.id),
    groupIds: cliGroups(context.data, context.getInstalledPlugins()).filter(group => group.pluginIds.includes(plugin.id)).map(group => group.id) };
}

export function showStructure(context: CliContext, params: CliData): string {
  return outputFormat(params, "tree") === "json" ? jsonOutput(structureFromData(context.data, context.getInstalledPlugins()))
    : cliGroups(context.data, context.getInstalledPlugins()).map(group => sectionTree(context, group)).join("\n");
}

function sectionTree(context: CliContext, group: Group): string {
  const state = isSectionCollapsed(context.data, groupSectionId(group)) ? "collapsed" : "expanded";
  return [`${group.name} (${group.id}) [${state}]`, ...group.pluginIds.map(plugin => `  ${pluginLabel(describePlugin(context, plugin))}`)].join("\n");
}

export function filterGroupsViews(context: CliContext, params: CliData): string {
  if (params.query === undefined) throw new Error("Missing query; use query=\"\" to clear the filter");
  if (params.scope !== undefined && params.group !== undefined) throw new Error("Use group or scope, not both");
  const scope = filterScope(context, params);
  const count = context.filterViews(params.query, scope);
  if (!count) throw new Error("Open PlugiGroups before applying a view filter");
  return `Updated ${scope ?? "all"} filter in ${count} view(s).`;
}

function filterScope(context: CliContext, params: CliData): string | null {
  if (params.group !== undefined) return resolveGroup(context.data, requiredParameter(params, "group")).id;
  const scope = params.scope ?? "all";
  if (scope !== "all" && scope !== "ungrouped") throw new Error("scope must be all or ungrouped");
  return scope === "all" ? null : UNGROUPED_ID;
}
