import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { StoreData } from '../storage/store';
import { canPersist, clearData, defaultData, loadData, saveData } from '../storage/store';

interface StoreApi {
  data: StoreData;
  /** True when this browser lets us save progress (false in some private windows). */
  persistent: boolean;
  update: (fn: (d: StoreData) => StoreData) => void;
  reset: () => void;
}

const Ctx = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData>(() => loadData());
  const [persistent] = useState<boolean>(() => canPersist());

  useEffect(() => {
    saveData(data);
  }, [data]);

  const update = useCallback((fn: (d: StoreData) => StoreData) => setData((prev) => fn(prev)), []);
  const reset = useCallback(() => {
    clearData();
    setData(defaultData());
  }, []);

  const value = useMemo(() => ({ data, persistent, update, reset }), [data, persistent, update, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}
