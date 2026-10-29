import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { computeView, type ViewResult } from '../model/graphView';
import { useStore } from '../store';

/** The visible graph for the current model and view state, recomputed only when an input changes. */
export function useView(): ViewResult | null {
  const s = useStore(
    useShallow((st) => ({
      model: st.model,
      expanded: st.expanded,
      hidden: st.hidden,
      edgeKinds: st.edgeKinds,
      entityKinds: st.entityKinds,
      origins: st.origins,
      resolutions: st.resolutions,
      usages: st.usages,
      disabledRoots: st.disabledRoots,
      hideTests: st.hideTests,
      hideIsolated: st.hideIsolated,
      minWeight: st.minWeight,
      mergeKinds: st.mergeKinds,
      focus: st.focus,
      searchFilter: st.searchFilter,
      maxFocusNodes: st.maxFocusNodes,
    })),
  );
  return useMemo(() => (s.model ? computeView(s.model, s) : null), [s]);
}
