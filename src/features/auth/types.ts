export type UserCapability = "global-domain-admin";

export type AuthSession = {
  userId: string;
  name: string;
  email: string;
  role: "student";
  capabilities: UserCapability[];
  createdAt: string;
};

/** Temporary compatibility alias while presentation components retain their original prop name. */
export type MockSession = AuthSession;
