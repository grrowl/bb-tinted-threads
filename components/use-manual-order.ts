import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { buildOrderRank, orderKey } from "@/lib/manual-order";
import { MANUAL_ORDER_CHANNEL } from "@/lib/channels";
import type { rpcContract } from "@/server";

export interface ManualOrderApi {
  /** Thread id → slot in the saved manual order, for the sort comparator. */
  orderRank: ReadonlyMap<string, number>;
  /** True while a reorder write is in flight. */
  isReordering: boolean;
  /** Persist a full manual order (root thread ids). Returns false on no-op/fail. */
  reorder(ids: readonly string[]): Promise<boolean>;
}

/**
 * Durable, optimistic manual thread order backed by the plugin KV store. The
 * in-flight write masks the host until it confirms; a realtime signal keeps
 * other open sidebars in sync.
 */
export function useManualOrder(): ManualOrderApi {
  const rpc = useRpc<typeof rpcContract>();
  const [storedIds, setStoredIds] = useState<readonly string[] | null>(null);
  const [optimisticIds, setOptimisticIds] = useState<readonly string[] | null>(
    null,
  );
  const [isReordering, setIsReordering] = useState(false);
  const inFlight = useRef(false);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const { ids } = await rpc.call("manualOrderList", {});
      // A confirmed write already holds the freshest order; don't clobber it
      // with a list read that raced the reorder.
      if (seq === requestSeq.current && !inFlight.current) {
        setStoredIds(ids);
      }
    } catch {
      // The default (newest-first) order stays usable if a read races a reload.
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime(MANUAL_ORDER_CHANNEL, () => {
    void refresh();
  });

  const effectiveIds = optimisticIds ?? storedIds;
  const orderRank = useMemo(() => buildOrderRank(effectiveIds), [effectiveIds]);

  const reorder = useCallback(
    async (ids: readonly string[]): Promise<boolean> => {
      if (inFlight.current) return false;
      if (effectiveIds && orderKey(ids) === orderKey(effectiveIds)) return false;
      inFlight.current = true;
      setIsReordering(true);
      setOptimisticIds([...ids]);
      try {
        const result = await rpc.call("manualOrderReorder", { ids: [...ids] });
        setStoredIds(result.ids);
        setOptimisticIds(null);
        return true;
      } catch {
        setOptimisticIds(null);
        return false;
      } finally {
        inFlight.current = false;
        setIsReordering(false);
      }
    },
    [effectiveIds, rpc],
  );

  return { orderRank, isReordering, reorder };
}
