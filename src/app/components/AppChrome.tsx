import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { MockSession } from "@/features/auth/types";
import { GlobalNav } from "./GlobalNav";

const AUTH_ROUTES = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);

/** Single primary chrome: the left rail. Auth pages use the board's split layout instead. */
export function AppChrome({ session, onLogout, children }: { session: MockSession | null; onLogout: () => void; children: ReactNode }) {
  const location = useLocation();
  if (AUTH_ROUTES.has(location.pathname)) return <>{children}</>;
  return (
    <div className="ef-app ef-shell-bg">
      <GlobalNav session={session} onLogout={onLogout} />
      <div className="ef-app-main">{children}</div>
    </div>
  );
}
