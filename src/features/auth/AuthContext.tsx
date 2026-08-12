import { createContext, useContext, type ReactNode } from "react";
import type { MockSession } from "@/features/workflow/model";

type AuthContextValue = {
  session: MockSession | null;
  completeAuth: (session: MockSession) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
