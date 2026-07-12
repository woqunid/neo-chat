import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  fetchApiGuruList,
  fetchMcpServerPage,
  getCachedPlugins,
} from "@/services/api/pluginService";
import type { Plugin } from "@/types";
import type { MarketSource } from "./types";
import { ITEMS_PER_PAGE } from "./utils";

interface ListingOptions {
  source: MarketSource;
  search: string;
  page: number;
  mcpPageCursors: string[];
  onMcpNextCursor(value: string): void;
  loadFailed: string;
  refreshFailed: string;
}

interface Options extends ListingOptions {
  _hasHydrated: boolean;
}

interface RequestTracker {
  mounted: MutableRefObject<boolean>;
  request: MutableRefObject<number>;
}

function useRequestTracker(): RequestTracker {
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(
    () => () => {
      mounted.current = false;
      request.current += 1;
    },
    [],
  );
  return useMemo(() => ({ mounted, request }), [mounted, request]);
}

function useStableListingOptions(options: ListingOptions): ListingOptions {
  return useMemo(
    () => ({
      source: options.source,
      search: options.search,
      page: options.page,
      mcpPageCursors: options.mcpPageCursors,
      onMcpNextCursor: options.onMcpNextCursor,
      loadFailed: options.loadFailed,
      refreshFailed: options.refreshFailed,
    }),
    [
      options.loadFailed,
      options.mcpPageCursors,
      options.onMcpNextCursor,
      options.page,
      options.refreshFailed,
      options.search,
      options.source,
    ],
  );
}

async function fetchListing(options: ListingOptions, forceRefresh: boolean) {
  if (options.source === "mcp") {
    return fetchMcpServerPage({
      forceRefresh,
      cursor: options.mcpPageCursors[options.page - 1] || "",
      search: options.search,
      limit: ITEMS_PER_PAGE,
    });
  }
  const cached = forceRefresh ? [] : getCachedPlugins();
  return {
    plugins: cached.length ? cached : await fetchApiGuruList(forceRefresh),
    nextCursor: "",
  };
}

function isCurrentRequest(tracker: RequestTracker, requestId: number): boolean {
  return tracker.mounted.current && tracker.request.current === requestId;
}

function getLoadError(options: ListingOptions, forceRefresh: boolean): string {
  return forceRefresh ? options.refreshFailed : options.loadFailed;
}

function useListingLoad(options: Options, tracker: RequestTracker) {
  const stableOptions = useStableListingOptions(options);
  const [available, setAvailable] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    async (forceRefresh = false) => {
      const requestId = ++tracker.request.current;
      setLoading(!forceRefresh);
      setRefreshing(forceRefresh);
      setError(null);
      try {
        const result = await fetchListing(stableOptions, forceRefresh);
        if (!isCurrentRequest(tracker, requestId)) return;
        setAvailable(result.plugins);
        stableOptions.onMcpNextCursor(result.nextCursor || "");
      } catch {
        if (!isCurrentRequest(tracker, requestId)) return;
        setError(getLoadError(stableOptions, forceRefresh));
      } finally {
        if (!isCurrentRequest(tracker, requestId)) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [stableOptions, tracker],
  );
  return { available, loading, refreshing, error, load };
}

export function useMarketListing(options: Options) {
  const { _hasHydrated } = options;
  const tracker = useRequestTracker();
  const listing = useListingLoad(options, tracker);
  const { load } = listing;
  useEffect(() => {
    if (!_hasHydrated) return;
    void load();
  }, [_hasHydrated, load]);
  return {
    available: listing.available,
    controller: {
      isLoading: listing.loading,
      isRefreshing: listing.refreshing,
      error: listing.error,
      refresh: () => load(true),
    },
  };
}
