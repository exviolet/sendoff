// Per-tab undo/redo history, kept as module-level state outside the Zustand
// store so it never triggers re-renders. Snapshots are tab content strings.
//
// Debounce: fast typing within DEBOUNCE_MS coalesces into one snapshot (the
// first of the series). Large edits (lenDiff > 1) are recorded immediately.

const MAX_HISTORY = 100;
const DEBOUNCE_MS = 500;

const undoStacks = new Map<string, string[]>();
const redoStacks = new Map<string, string[]>();
const lastPushTime = new Map<string, number>();
const pendingSnapshot = new Map<string, string>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function flushPending(id: string) {
  const snapshot = pendingSnapshot.get(id);
  if (snapshot === undefined) return;
  if (!undoStacks.has(id)) undoStacks.set(id, []);
  const stack = undoStacks.get(id)!;
  if (stack[stack.length - 1] !== snapshot) {
    stack.push(snapshot);
    if (stack.length > MAX_HISTORY) stack.shift();
  }
  pendingSnapshot.delete(id);
  flushTimers.delete(id);
}

export function disposeHistory(id: string) {
  undoStacks.delete(id);
  redoStacks.delete(id);
  lastPushTime.delete(id);
  pendingSnapshot.delete(id);
  const timer = flushTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  flushTimers.delete(id);
}

export function pushHistory(id: string, prevContent: string, newContent: string) {
  const now = Date.now();
  const lastTime = lastPushTime.get(id) ?? 0;
  const lenDiff = Math.abs(newContent.length - prevContent.length);

  if (lenDiff > 1 || now - lastTime > DEBOUNCE_MS) {
    flushPending(id);
    if (!undoStacks.has(id)) undoStacks.set(id, []);
    const stack = undoStacks.get(id)!;
    if (stack[stack.length - 1] !== prevContent) {
      stack.push(prevContent);
      if (stack.length > MAX_HISTORY) stack.shift();
    }
    pendingSnapshot.delete(id);
    lastPushTime.set(id, now);
  } else {
    if (!pendingSnapshot.has(id)) {
      pendingSnapshot.set(id, prevContent);
    }
    clearTimeout(flushTimers.get(id));
    flushTimers.set(id, setTimeout(() => flushPending(id), DEBOUNCE_MS));
    lastPushTime.set(id, now);
  }

  redoStacks.set(id, []);
}

// Pops the last undo snapshot, recording currentContent onto the redo stack.
// Returns undefined when there's nothing to undo.
export function takeUndo(id: string, currentContent: string): string | undefined {
  flushPending(id);
  const stack = undoStacks.get(id);
  if (!stack || stack.length === 0) return undefined;
  if (!redoStacks.has(id)) redoStacks.set(id, []);
  redoStacks.get(id)!.push(currentContent);
  return stack.pop();
}

// Symmetric to takeUndo: pops the last redo snapshot, recording currentContent
// back onto the undo stack. Returns undefined when there's nothing to redo.
export function takeRedo(id: string, currentContent: string): string | undefined {
  flushPending(id);
  const stack = redoStacks.get(id);
  if (!stack || stack.length === 0) return undefined;
  if (!undoStacks.has(id)) undoStacks.set(id, []);
  undoStacks.get(id)!.push(currentContent);
  return stack.pop();
}
