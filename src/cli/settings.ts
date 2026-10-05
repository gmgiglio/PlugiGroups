import type { CliData } from "obsidian";
import { setCollapseMode, setMultipleGroupsAllowed, type GroupData } from "../groups";
import type { CliContext } from "./types";
import { cloneGroupData, jsonOutput, requiredParameter } from "./parameters";

const BOOLEAN_KEYS = ["allowMultipleGroups", "showRibbonButton", "confirmGroupDeletion", "showDragHandlesOnHover"] as const;
const SETTING_KEYS = [...BOOLEAN_KEYS, "openLocation", "collapseMode"] as const;
type SettingKey = typeof SETTING_KEYS[number];

function settingKey(params: CliData): SettingKey {
  const key = requiredParameter(params, "key");
  if (!SETTING_KEYS.some(known => known === key)) throw new Error(`Unknown setting: ${key}. Use ${SETTING_KEYS.join(", ")}`);
  return key as SettingKey;
}

export function readSettings(context: CliContext, params: CliData): string {
  if (params.key !== undefined) return jsonOutput(context.data[settingKey(params)]);
  return jsonOutput(Object.fromEntries(SETTING_KEYS.map(key => [key, context.data[key]])));
}

export async function writeSetting(context: CliContext, params: CliData): Promise<string> {
  const next = cloneGroupData(context.data);
  applySetting(next, settingKey(params), requiredParameter(params, "value"));
  await context.commitData(next);
  return readSettings(context, params);
}

function applySetting(data: GroupData, key: SettingKey, value: string): void {
  if (key === "openLocation") {
    if (value !== "tab" && value !== "window") throw new Error("openLocation must be tab or window");
    data.openLocation = value;
  } else if (key === "collapseMode") applyCollapseSetting(data, value);
  else applyBooleanSetting(data, key, value);
}

function applyBooleanSetting(data: GroupData, key: typeof BOOLEAN_KEYS[number], value: string): void {
  if (value !== "true" && value !== "false") throw new Error(`${key} must be true or false`);
  if (key === "allowMultipleGroups") setMultipleGroupsAllowed(data, value === "true");
  else data[key] = value === "true";
}

function applyCollapseSetting(data: GroupData, value: string): void {
  if (value !== "individual" && value !== "collapsed" && value !== "expanded") throw new Error("collapseMode must be individual, collapsed, or expanded");
  setCollapseMode(data, value);
}
