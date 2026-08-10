import { useEditorStore } from "../../store/editorStore";

/**
 * Незатухающая полоса о провале чтения IndexedDB.
 *
 * Тост тут не годится: он уходит через 2.5с, после чего на экране остаётся пустой
 * редактор со свежим «Untitled 1» — а это ровно то, что пользователь читает как
 * «все мои табы пропали». Полоса держится, пока чтение провалено.
 *
 * Закрыть её нельзя намеренно. Пока `isHydrated` false, запись заблокирована (гард в
 * useSessionPersistence), то есть всё набранное будет потеряно при выходе — прятать
 * такое за крестиком нечестно.
 */
export function StorageErrorBanner() {
  const storageError = useEditorStore((s) => s.storageError);
  if (!storageError) return null;

  return (
    <div
      role="alert"
      className="shrink-0 border-b border-danger/25 bg-danger/10 px-4 py-2.5 text-[11px] text-danger"
    >
      <div className="font-semibold">
        Could not open local storage — your tabs were not loaded
      </div>
      <div className="mt-1 text-danger/85 leading-relaxed">
        Nothing you type now will be saved. Your existing data has{" "}
        <strong className="font-semibold">not</strong> been changed or deleted — Rewrite
        stops writing entirely when it cannot read, so a failed read can never overwrite
        your tabs.
      </div>
      <div className="mt-1 text-danger/85 leading-relaxed">
        The usual cause is opening your data with a build that bundles an{" "}
        <strong className="font-semibold">older WebKit</strong> than the one that wrote
        it — for example running the AppImage after a build from source. Newer WebKit
        upgrades the database format; older WebKit cannot read it back. Use the build you
        had before, and your tabs are still there.
      </div>
      <div className="mt-1.5 font-mono text-[10px] break-all text-danger/70">
        {storageError}
      </div>
    </div>
  );
}
