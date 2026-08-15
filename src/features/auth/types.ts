export type UserRole = "student" | "teacher" | "admin";
export type UserCapability = "global-domain-admin";

export type AuthSession = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  capabilities: UserCapability[];
  createdAt: string;
};

/** Temporary compatibility alias while presentation components retain their original prop name. */
export type MockSession = AuthSession;
