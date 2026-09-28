import assert from "node:assert/strict";
import test from "node:test";
import { runPluginOperationWithPendingState } from "../../src/pendingPluginOperations";

test("overlapping group and plugin operations are rejected while IDs are pending", async () => {
  const pending = new Set<string>();
  const rendered: string[][] = [];
  const calls: string[] = [];
  let finishFirst!: () => void;
  const firstOperation = new Promise<void>(resolve => { finishFirst = resolve; });
  const refresh = (): void => { rendered.push([...pending].sort()); };

  const first = runPluginOperationWithPendingState(pending, ["alpha", "shared"], refresh, async () => {
    calls.push("first");
    await firstOperation;
  });
  const overlappingGroup = await runPluginOperationWithPendingState(pending, ["shared", "beta"], refresh, async () => { calls.push("overlapping group"); });
  const overlappingPlugin = await runPluginOperationWithPendingState(pending, ["shared"], refresh, async () => { calls.push("overlapping plugin"); });
  const independent = await runPluginOperationWithPendingState(pending, ["gamma"], refresh, async () => { calls.push("independent"); });

  assert.equal(overlappingGroup, false);
  assert.equal(overlappingPlugin, false);
  assert.equal(independent, true);
  assert.deepEqual(calls, ["first", "independent"]);
  assert.deepEqual([...pending].sort(), ["alpha", "shared"]);

  finishFirst();
  assert.equal(await first, true);
  assert.deepEqual([...pending], []);
  assert.deepEqual(rendered, [["alpha", "shared"], ["alpha", "gamma", "shared"], ["alpha", "shared"], []]);
});

test("failed operations release pending plugin IDs", async () => {
  const pending = new Set<string>();
  const refresh = (): void => {};
  await assert.rejects(runPluginOperationWithPendingState(pending, ["shared"], refresh, async () => {
    throw new Error("enable failed");
  }), /enable failed/);
  assert.deepEqual([...pending], []);
  assert.equal(await runPluginOperationWithPendingState(pending, ["shared"], refresh, async () => {}), true);
});
