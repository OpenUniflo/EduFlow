import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Material } from "@/features/course/types";
import { resolveInitialMaterialSegment } from "../materialNavigation";
import { classifySegmentQueryChange, shouldHandleExternalSegment, type MaterialNavigationReason, type MaterialNavigationRequest } from "./materialReaderState";
import { sortMaterialSegments } from "../materialOrdering";

export function useMaterialReaderState({ material, requestedSegmentId, recentSegmentId, onReplaceSegment }: {
  material: Material;
  requestedSegmentId: string | null;
  recentSegmentId?: string;
  onReplaceSegment(segmentId: string): void;
}) {
  const orderedSegments = useMemo(() => sortMaterialSegments(material), [material]);
  const segmentIds = useMemo(() => orderedSegments.map((segment) => segment.id), [orderedSegments]);
  const segmentById = useMemo(() => new Map(orderedSegments.map((segment) => [segment.id, segment])), [orderedSegments]);
  const validSegmentIds = useMemo(() => new Set(segmentIds), [segmentIds]);
  const initialSegmentId = resolveInitialMaterialSegment({ segmentIds, requestedSegmentId, recentSegmentId });
  const [activeSegmentId, setActiveSegmentId] = useState(initialSegmentId);
  const [navigationRequest, setNavigationRequest] = useState<MaterialNavigationRequest | null>(null);
  const materialIdentityRef = useRef<string | null>(null);
  const readerWrittenSegmentRef = useRef<string | null>(null);
  const lastObservedRequestedSegmentRef = useRef<string | null>(requestedSegmentId);
  const isProgrammaticNavigationRef = useRef(false);
  const tokenRef = useRef(0);

  const navigateProgrammatically = useCallback((segmentId: string, reason: MaterialNavigationReason, behavior: ScrollBehavior) => {
    const segment = segmentById.get(segmentId);
    if (!segment) return;
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    isProgrammaticNavigationRef.current = true;
    setActiveSegmentId(segmentId);
    setNavigationRequest({ token, segmentId, page: segment.page ?? segment.order, behavior, reason });
  }, [segmentById]);

  useEffect(() => {
    if (materialIdentityRef.current !== material.id) {
      materialIdentityRef.current = material.id;
      lastObservedRequestedSegmentRef.current = requestedSegmentId;
      const resolved = resolveInitialMaterialSegment({ segmentIds, requestedSegmentId, recentSegmentId });
      if (resolved) navigateProgrammatically(resolved, "initial", "auto");
      return;
    }
    const queryChange = classifySegmentQueryChange(lastObservedRequestedSegmentRef.current, requestedSegmentId, readerWrittenSegmentRef.current);
    if (queryChange === "unchanged") return;
    lastObservedRequestedSegmentRef.current = requestedSegmentId;
    if (queryChange === "reader") {
      readerWrittenSegmentRef.current = null;
      return;
    }
    if (shouldHandleExternalSegment({ requestedSegmentId, activeSegmentId, validSegmentIds, readerWrittenSegmentId: readerWrittenSegmentRef.current })) {
      navigateProgrammatically(requestedSegmentId!, "external", "auto");
    }
  }, [activeSegmentId, material.id, navigateProgrammatically, recentSegmentId, requestedSegmentId, segmentIds, validSegmentIds]);

  useEffect(() => {
    if (!activeSegmentId || requestedSegmentId === activeSegmentId) return;
    readerWrittenSegmentRef.current = activeSegmentId;
    onReplaceSegment(activeSegmentId);
  }, [activeSegmentId, onReplaceSegment, requestedSegmentId]);

  const observeSegment = useCallback((segmentId: string) => {
    if (!validSegmentIds.has(segmentId) || isProgrammaticNavigationRef.current) return;
    setActiveSegmentId((current) => current === segmentId ? current : segmentId);
  }, [validSegmentIds]);

  const settleNavigation = useCallback((token: number) => {
    if (!navigationRequest || navigationRequest.token !== token) return;
    setActiveSegmentId(navigationRequest.segmentId);
    isProgrammaticNavigationRef.current = false;
    setNavigationRequest(null);
  }, [navigationRequest]);

  return {
    activeSegmentId,
    navigationRequest,
    isProgrammaticNavigationRef,
    navigateToSegment: navigateProgrammatically,
    observeSegment,
    settleNavigation
  };
}
