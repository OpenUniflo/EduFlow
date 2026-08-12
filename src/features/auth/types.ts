export type UserCapability = "global-domain-admin";

export type MockSession = {
  name: string;
  email: string;
  role: "student";
  capabilities: UserCapability[];
  createdAt: string;
};
