import type { CliData } from "obsidian";
import type { Group, GroupData } from "../groups";
import type { InstalledPlugin } from "../inventory";
import { cliGroups, groupSectionId } from "./groups";

export function requiredParameter(params: CliData, key: string): string {
  const value = params[key]?.trim();
  if (!value) throw new Error(`Missing required parameter: ${key}`);
  return value;
}

export function booleanParameter(params: CliData, key: string): boolean {
  const value = params[key];
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${key} must be true or false`);
}

export function resolveGroup(data: GroupData, selector: string, plugins: InstalledPlugin[] = []): Group {
  const groups = cliGroups(data, plugins);
  const byId = groups.find(group => group.id === selector);
  if (byId) return byId;
  const matches = groups.filter(group => group.name.toLocaleLowerCase() === selector.toLocaleLowerCase());
  if (matches.length !== 1) throw new Error(matches.length ? `Ambiguous group: ${selector}. Use its ID.` : `Unknown group: ${selector}`);
  return matches[0];
}

export function resolveSection(data: GroupData, selector: string): string | null {
  return groupSectionId(resolveGroup(data, selector));
}

export function outputFormat(params: CliData, fallback: "text" | "tree" | "json"): string {
  const format = params.format ?? fallback;
  if (format !== "json" && format !== fallback) throw new Error(`format must be ${fallback} or json`);
  return format;
}

export function cloneGroupData(data: GroupData): GroupData {
  return JSON.parse(JSON.stringify(data)) as GroupData;
}

export function jsonOutput(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
