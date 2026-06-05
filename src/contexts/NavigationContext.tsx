import { createContext, useContext, type ReactNode } from "react";

export type NavigationContextValue = {
  onGoCourses: () => void;
  onGoTasks: () => void;
  onGoWorkflows: () => void;
  onGoProfile: () => void;
  onGoSettings: () => void;
  onGoNotifications: () => void;
  onGoMessages: () => void;
  onLogout: () => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ value, children }: { value: NavigationContextValue; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return value;
}
