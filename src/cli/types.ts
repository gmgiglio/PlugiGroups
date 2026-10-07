import type { CliData, CliFlags, CliHandler } from "obsidian";
import type { GroupData } from "../groups/data";
import type { InstalledPlugin } from "../plugins/inventory";

export interface CliContext {
  readonly data: GroupData;
  readonly selfId: string;
  readonly pendingPluginIds: Set<string>;
  readonly getInstalledPlugins: () => InstalledPlugin[];
  readonly commitData: (data: GroupData) => Promise<void>;
  readonly refreshViews: () => void;
  readonly setPluginEnabled: (id: string, enabled: boolean) => Promise<void>;
  readonly filterViews: (query: string, groupId: string | null) => number;
}

export interface CliCommand {
  readonly action: string;
  readonly description: string;
  readonly flags: CliFlags;
  readonly run: (context: CliContext, params: CliData) => string | Promise<string>;
}

export type RegisterCliHandler = (command: string, description: string, flags: CliFlags, handler: CliHandler) => void;
