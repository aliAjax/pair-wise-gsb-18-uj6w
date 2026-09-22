// 页面层：应用状态 hook。数据读写走数据层，变更走规则层。

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppState } from "../data/types";
import { loadState, resetState, saveState } from "../data/repository";
import type { RuleResult } from "../rules/validations";

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState());

  // 每次变更后持久化：刷新后牙位、耗材、费用、冲销与版本保持一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  // 跨标签页同步
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key) setState(loadState());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const apply = useCallback((result: RuleResult<AppState>): true | string => {
    if (result.ok) {
      setState(result.value);
      return true;
    }
    return result.error;
  }, []);

  const reset = useCallback(() => setState(resetState()), []);

  return useMemo(() => ({ state, setState, apply, reset }), [state, apply, reset]);
}
