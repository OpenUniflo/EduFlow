const settingsStorageKey = "knowledge-atlas.workflow-settings.v2";

export type LegacySettings = {
  dailyReminder: boolean;
  compactMode: boolean;
  emailDigest: boolean;
  [key: string]: unknown;
};

const defaults: LegacySettings = { dailyReminder: true, compactMode: false, emailDigest: true };

export function readLegacySettings(): LegacySettings {
  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    return raw ? { ...defaults, ...JSON.parse(raw) as Record<string, unknown> } : defaults;
  } catch {
    return defaults;
  }
}

export function writeLegacySettings(settings: LegacySettings) {
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
}
