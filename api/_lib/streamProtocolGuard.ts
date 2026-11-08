import type { TextStreamPart, ToolSet } from "ai";
import { heldCardHistorySuffixLength, heldProtocolSuffixLength, protocolLeakInProgress, stripCardHistoryMarkers } from "../../src/features/assistant/protocolGuard.js";

export class AssistantProtocolLeakError extends Error {
  readonly code = "protocol_leak";
  constructor() {
    super("assistant_protocol_leak");
    this.name = "AssistantProtocolLeakError";
  }
}

type AnyPart = TextStreamPart<ToolSet>;

/**
 * Streaming protocol guard.
 *
 * Text deltas are inspected before they reach the UI stream. A short trailing
 * suffix that could still become a protocol opener is withheld; everything
 * before it is released immediately, so ordinary answers still stream. When a
 * complete opener arrives the stream fails: nothing from the marker onward is
 * delivered or persisted, and the client retries once.
 */
export function createProtocolGuardTransform(): TransformStream<AnyPart, AnyPart> {
  const buffers = new Map<string, string>();

  const release = (controller: TransformStreamDefaultController<AnyPart>, id: string, delta: string) => {
    const text = stripCardHistoryMarkers(delta);
    if (text) controller.enqueue({ type: "text-delta", id, text } as AnyPart);
  };

  const flush = (controller: TransformStreamDefaultController<AnyPart>, id?: string) => {
    const ids = id ? [id] : [...buffers.keys()];
    for (const key of ids) {
      const pending = buffers.get(key) ?? "";
      buffers.delete(key);
      if (!pending) continue;
      if (protocolLeakInProgress(pending)) throw new AssistantProtocolLeakError();
      release(controller, key, pending);
    }
  };

  return new TransformStream<AnyPart, AnyPart>({
    transform(part, controller) {
      // A learner stop is not a finished answer. Never release a held suffix on
      // abort: it may be a protocol opener that has not arrived completely yet.
      if (part.type === "abort") {
        buffers.clear();
        controller.enqueue(part);
        return;
      }
      if (part.type !== "text-delta") {
        flush(controller);
        controller.enqueue(part);
        return;
      }
      const id = part.id;
      const buffer = (buffers.get(id) ?? "") + part.text;
      if (protocolLeakInProgress(buffer)) throw new AssistantProtocolLeakError();
      const hold = Math.max(heldProtocolSuffixLength(buffer), heldCardHistorySuffixLength(buffer));
      const safe = hold ? buffer.slice(0, buffer.length - hold) : buffer;
      if (safe) release(controller, id, safe);
      buffers.set(id, hold ? buffer.slice(buffer.length - hold) : "");
    },
    flush(controller) {
      flush(controller);
    }
  });
}
