/**
 * Pure state for the one running Micro instance.
 *
 * The runner is mounted once by MicroHost and only the DOM container moves
 * between the conversation card, the side panel and the modal dialog. Keeping
 * `form` and `returnForm` in one reducer makes every transition explicit and
 * testable: focus always remembers where it came from, closing keeps the path
 * (and therefore the mounted answers) alive, and dismissal only affects the
 * side form.
 */

export type MicroForm = "inline" | "side" | "focus" | "closed";
export type MicroNonFocusForm = Exclude<MicroForm, "focus" | "closed">;

export type MicroOpenInput = {
  pathId: string;
  knowledgeId: string;
  courseId?: string;
};

export type MicroPresence = MicroOpenInput & {
  form: MicroForm;
  /** The form an immersive dialog returns to; never focus or closed. */
  returnForm: MicroNonFocusForm;
};

export type MicroPresenceState = { presence: MicroPresence | null };

export type MicroPresenceAction =
  | { type: "open"; input: MicroOpenInput; form: MicroForm; defaultForm: MicroNonFocusForm }
  | { type: "set-form"; form: MicroForm }
  | { type: "dismiss-side" }
  | { type: "clear" };

export const MICRO_FORM_STORAGE_KEY = "eduflow:micro:form";

/** Multi-unit paths are complex enough to start beside the conversation. */
export function defaultMicroForm(unitCount: number): MicroNonFocusForm {
  return unitCount > 1 ? "side" : "inline";
}

/**
 * A remembered form is only a preference. Immersive is a deliberate user
 * action, so a stored "focus" (or a closed form) falls back to the path default.
 */
export function preferredMicroForm(defaultForm: MicroNonFocusForm, stored: MicroForm | null): MicroNonFocusForm {
  return stored === "inline" || stored === "side" ? stored : defaultForm;
}

function nonFocusForm(form: MicroForm, fallback: MicroNonFocusForm): MicroNonFocusForm {
  return form === "inline" || form === "side" ? form : fallback;
}

export function reduceMicroPresence(state: MicroPresenceState, action: MicroPresenceAction): MicroPresenceState {
  switch (action.type) {
    case "open": {
      const defaultForm = action.defaultForm;
      const target = action.form === "closed" ? defaultForm : action.form;
      const previous = state.presence;
      if (previous && previous.pathId === action.input.pathId) {
        const returnForm = target === "focus"
          ? nonFocusForm(previous.form, previous.returnForm)
          : target;
        if (previous.form === target && previous.knowledgeId === action.input.knowledgeId && previous.courseId === action.input.courseId && previous.returnForm === returnForm) return state;
        return { presence: { ...previous, ...action.input, form: target, returnForm } };
      }
      return {
        presence: {
          ...action.input,
          form: target,
          returnForm: target === "focus" ? defaultForm : nonFocusForm(target, defaultForm)
        }
      };
    }
    case "set-form": {
      const previous = state.presence;
      if (!previous || previous.form === action.form) return state;
      if (action.form === "focus") {
        return { presence: { ...previous, form: "focus", returnForm: nonFocusForm(previous.form, previous.returnForm) } };
      }
      if (action.form === "closed") {
        return { presence: { ...previous, form: "closed", returnForm: nonFocusForm(previous.form, previous.returnForm) } };
      }
      return { presence: { ...previous, form: action.form, returnForm: action.form } };
    }
    case "dismiss-side":
      return state.presence?.form === "side"
        ? { presence: { ...state.presence, form: "closed" } }
        : state;
    case "clear":
      return state.presence ? { presence: null } : state;
  }
}

/** `knowledgeId:pathId[:courseId]` — course IDs may themselves contain colons. */
export function parseMicroParam(value: string | null | undefined): MicroOpenInput | null {
  if (!value) return null;
  const [knowledgeId, pathId, ...courseParts] = value.split(":");
  if (!knowledgeId || !pathId) return null;
  const courseId = courseParts.join(":") || undefined;
  return courseId ? { knowledgeId, pathId, courseId } : { knowledgeId, pathId };
}

export function formatMicroParam(input: MicroOpenInput): string {
  return [input.knowledgeId, input.pathId, input.courseId ?? ""].join(":");
}

/**
 * Only side and focus are addressable. A conversation-inline form needs a
 * specific card to host it, so a reload falls back to the side workspace.
 */
export function parseMicroView(value: string | null | undefined): Exclude<MicroForm, "closed" | "inline"> | null {
  return value === "side" || value === "focus" ? value : null;
}

/** localStorage is a preference only; private browsing and quota errors are ignored. */
export function readMicroFormPreference(storage?: Pick<Storage, "getItem"> | null): MicroForm | null {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    const value = target?.getItem(MICRO_FORM_STORAGE_KEY);
    return value === "inline" || value === "side" || value === "focus" || value === "closed" ? value : null;
  } catch {
    return null;
  }
}

export function writeMicroFormPreference(form: MicroForm, storage?: Pick<Storage, "setItem"> | null): void {
  try {
    const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    target?.setItem(MICRO_FORM_STORAGE_KEY, form);
  } catch {
    /* preference storage may be unavailable */
  }
}
