import { setIcon, type Plugin, type Workspace, type WorkspaceLeaf } from "obsidian";

const WINDOW_CLASS = "plugin-groups-admin-dedicated-window";

interface DedicatedWindows {
  workspace: Workspace;
  viewType: string;
  documents: Set<Document>;
  titles: HTMLElement[];
  openSettings: () => void;
  updating: boolean;
}

interface MovableTabGroup {
  removeChild: (leaf: WorkspaceLeaf) => void;
  insertChild: (index: number, leaf: WorkspaceLeaf) => void;
}

export function registerDedicatedGroupsWindows(plugin: Plugin, viewType: string, openSettings: () => void): void {
  const state: DedicatedWindows = { workspace: plugin.app.workspace, viewType, documents: new Set(), titles: [], openSettings, updating: false };
  plugin.registerEvent(state.workspace.on("layout-change", () => updateDedicatedWindows(state)));
  state.workspace.onLayoutReady(() => updateDedicatedWindows(state));
  plugin.register(() => clearDedicatedWindowStyles(state));
}

function updateDedicatedWindows(state: DedicatedWindows): void {
  if (state.updating) return;
  state.updating = true;
  try {
    clearDedicatedWindowStyles(state);
    for (const leaf of dedicatedGroupsLeaves(state)) reserveGroupsWindow(state, leaf);
  } finally {
    state.updating = false;
  }
}

function dedicatedGroupsLeaves(state: DedicatedWindows): WorkspaceLeaf[] {
  const windows = new Set<Document>();
  return state.workspace.getLeavesOfType(state.viewType).filter(leaf => {
    const container = leaf.getContainer();
    if (container === state.workspace.rootSplit || windows.has(container.doc)) return false;
    windows.add(container.doc);
    return true;
  });
}

function reserveGroupsWindow(state: DedicatedWindows, groupsLeaf: WorkspaceLeaf): void {
  const container = groupsLeaf.getContainer();
  container.doc.body.classList.add(WINDOW_CLASS);
  state.documents.add(container.doc);
  addWindowTitle(state, container.doc);
  if (!groupsLeaf.getViewState().pinned) groupsLeaf.setPinned(true);
  const otherLeaves: WorkspaceLeaf[] = [];
  state.workspace.iterateAllLeaves(leaf => {
    if (leaf !== groupsLeaf && leaf.getContainer() === container) otherLeaves.push(leaf);
  });
  for (const leaf of otherLeaves) moveLeafToMainWindow(state.workspace, leaf);
}

function addWindowTitle(state: DedicatedWindows, doc: Document): void {
  const header = doc.querySelector<HTMLElement>(".workspace-tab-header-container");
  if (!header) return;
  const title = header.createDiv({ cls: "plugin-groups-admin-window-title" });
  title.createSpan({ text: "PlugiGroups" });
  const button = title.createEl("button", { cls: "clickable-icon plugin-groups-admin-window-settings", attr: { type: "button", "aria-label": "Open PlugiGroups settings" } });
  setIcon(button, "settings");
  button.addEventListener("click", state.openSettings);
  state.titles.push(title);
}

function moveLeafToMainWindow(workspace: Workspace, leaf: WorkspaceLeaf): void {
  let mainLeaf: WorkspaceLeaf | null = null;
  workspace.iterateAllLeaves(candidate => {
    if (candidate.getRoot() === workspace.rootSplit) mainLeaf = candidate;
  });
  const destination = (mainLeaf ?? workspace.createLeafInParent(workspace.rootSplit, 0)).parent;
  const source = leaf.parent as unknown as MovableTabGroup;
  const target = destination as unknown as MovableTabGroup;
  source.removeChild(leaf);
  target.insertChild(-1, leaf);
  workspace.setActiveLeaf(leaf, { focus: true });
}

function clearDedicatedWindowStyles(state: DedicatedWindows): void {
  for (const doc of state.documents) doc.body.classList.remove(WINDOW_CLASS);
  for (const title of state.titles) title.remove();
  state.documents.clear();
  state.titles = [];
}
