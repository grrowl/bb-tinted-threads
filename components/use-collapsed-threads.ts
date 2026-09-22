import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { COLLAPSED_THREADS_CHANNEL } from "@/lib/channels";
import type { rpcContract } from "@/server";

export interface CollapsedThreadsApi {
  /** Thread ids whose children are collapsed. */
  collapsedIds: ReadonlySet<string>;
  /** Collapse or expand a thread's children, persisting the change. */
  toggle(threadId: string): void;
}

/**
 * Durable, optimistic set of collapsed parent threads, backed by the plugin KV
 * store and kept in sync across sidebars with a realtime signal.
 */
export function useCollapsedThreads(): CollapsedThreadsApi {
  const rpc = useRpc<typeof rpcContract>();
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const inFlight = useRef(false);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await rpc.call("collapsedThreadsList", {});
      if (seq === requestSeq.current && !inFlight.current) {
        setIds(new Set(result.ids));
      }
    } catch {
      // A read that races a reload just leaves everything expanded.
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime(COLLAPSED_THREADS_CHANNEL, () => {
    void refresh();
  });

  const toggle = useCallback(
    (threadId: string) => {
      const next = new Set(idsRef.current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      setIds(next);
      inFlight.current = true;
      void rpc
        .call("collapsedThreadsSet", { ids: [...next] })
        .then((result) => setIds(new Set(result.ids)))
        .catch(() => {
          // Keep the optimistic set; a later refresh reconciles.
        })
        .finally(() => {
          inFlight.current = false;
        });
    },
    [rpc],
  );

  return useMemo(() => ({ collapsedIds: ids, toggle }), [ids, toggle]);
}
