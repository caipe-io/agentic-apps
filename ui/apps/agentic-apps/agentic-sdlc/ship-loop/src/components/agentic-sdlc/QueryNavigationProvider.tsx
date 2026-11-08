"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createQueryNavigation } from "../../../../../../_lib/query-navigation.mjs";

type QueryContext = {
  params: ReturnType<typeof useSearchParams>;
  setParams: (values: Record<string, string | null>, mode?: "push" | "replace") => void;
};
const Context = createContext<QueryContext | null>(null);

export function QueryNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const navigation = useRef<ReturnType<typeof createQueryNavigation> | null>(null);
  useEffect(() => {
    const bridge = createQueryNavigation({ appId: "agentic-sdlc", appPath: "/apps/agentic-sdlc" + (pathname === "/" ? "" : pathname),
      // Next observes native history changes and updates useSearchParams itself.
      restore: () => {},
    });
    navigation.current = bridge;
    return () => { bridge.dispose(); navigation.current = null; };
  }, [pathname]);
  function setParams(values: Record<string, string | null>, mode: "push" | "replace" = "push") {
    const next = new URLSearchParams(window.location.search);
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value); else next.delete(name);
    }
    navigation.current?.commit(next.toString(), mode);
  }
  return <Context.Provider value={{ params, setParams }}>{children}</Context.Provider>;
}

export function useAppQuery() {
  const context = useContext(Context);
  if (!context) throw new Error("Query navigation requires its app provider");
  return context;
}
