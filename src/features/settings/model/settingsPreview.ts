/**
 * Feature Preview contract for settings surfaces that have no backend yet.
 * The sample source lives in src/demo/preview/settings and is injected by
 * src/app; feature code never imports it.
 */
export type SettingsNotification = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type SettingsDevice = {
  id: string;
  name: string;
  detail: string;
  current: boolean;
};

export type ProfileVisibility = "private" | "followers" | "organization" | "link";

export type SettingsPrivacy = {
  visibility: ProfileVisibility;
  learningProgress: boolean;
  works: boolean;
  heatmap: boolean;
  capabilityOverview: boolean;
};

export type SettingsPreview = {
  notifications: readonly SettingsNotification[];
  devices: readonly SettingsDevice[];
  privacy: SettingsPrivacy;
};
