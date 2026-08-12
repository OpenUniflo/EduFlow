const settingsStorageKey = "knowledge-atlas.workflow-settings.v2";

export type LegacySettings = {
  dailyReminder: boolean;
  compactMode: boolean;
  emailDigest: boolean;
  [key: string]: unknown;
};

type LegacyPreferenceSettings = Pick<LegacySettings, "dailyReminder" | "compactMode" | "emailDigest">;
type LegacySettingsStorage = Pick<Storage, "getItem" | "setItem">;

const defaults: LegacySettings = { dailyReminder: true, compactMode: false, emailDigest: true };

export function readLegacySettings(): LegacySettings {
  try {
    const raw = window.localStorage.getItem(settingsStorageKey);
    return raw ? { ...defaults, ...JSON.parse(raw) as Record<string, unknown> } : defaults;
  } catch {
    return defaults;
  }
}

export function writeLegacySettings(settings: LegacyPreferenceSettings, storage: LegacySettingsStorage = window.localStorage) {
  let existing: Record<string, unknown> = {};
  try {
    const raw = storage.getItem(settingsStorageKey);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) existing = parsed as Record<string, unknown>;
  } catch {
    // Invalid legacy JSON is replaced with a valid payload containing the requested preferences.
  }
  storage.setItem(settingsStorageKey, JSON.stringify({
    ...existing,
    dailyReminder: settings.dailyReminder,
    compactMode: settings.compactMode,
    emailDigest: settings.emailDigest
  }));
}
