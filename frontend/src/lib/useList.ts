import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import { notifyError } from "./notify";

/**
 * Fetch a GET endpoint into state with loading + manual reload. `query` is
 * stringified for the dependency key, so pass a stable/primitive-derived object.
 */
export function useList<T>(
  path: string,
  query?: Record<string, string | number | null | undefined>,
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query ?? {});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<T[]>(path, { query });
      setData(res);
    } catch (e) {
      notifyError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, reload, setData };
}
