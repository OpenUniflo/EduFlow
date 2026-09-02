import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { MaterialSegment } from "@/features/course/types";
import { getMaterialSourceUrl } from "@/features/material/ApiMaterialStorageService";
import { selectPageAtReadingAnchor, type MaterialNavigationRequest, type VisiblePageCandidate } from "./materialReaderState";
import { createPdfPageRecoveryGuard, loadPdfWithFreshSource, resolvePdfSourceUrl } from "./pdfSourceLifecycle";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function PdfPageCanvas({ document, page, segment, availableWidth, zoom, active, initialAspectRatio, onFatalError }: {
  document: PDFDocumentProxy;
  page: number;
  segment: MaterialSegment;
  availableWidth: number;
  zoom: number;
  active: boolean;
  initialAspectRatio: number;
  onFatalError(reason: unknown): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || availableWidth <= 0) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setRendered(false);
    setRenderError(false);
    document.getPage(page).then((pdfPage) => {
      if (cancelled) return;
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      setAspectRatio(baseViewport.height / baseViewport.width);
      const fitScale = availableWidth / baseViewport.width;
      const cssScale = fitScale * zoom;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = pdfPage.getViewport({ scale: cssScale * outputScale });
      const cssViewport = pdfPage.getViewport({ scale: cssScale });
      canvas.width = Math.max(1, Math.floor(renderViewport.width));
      canvas.height = Math.max(1, Math.floor(renderViewport.height));
      canvas.style.width = `${Math.floor(cssViewport.width)}px`;
      canvas.style.height = `${Math.floor(cssViewport.height)}px`;
      renderTask = pdfPage.render({ canvas, viewport: renderViewport });
      return renderTask.promise;
    }).then(() => { if (!cancelled) setRendered(true); }).catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        setRenderError(true);
        onFatalError(error);
      }
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [availableWidth, document, onFatalError, page, zoom]);

  return <article className={`atlas-pdf-page ${active ? "current" : ""}`} data-segment-id={segment.id} data-page-number={page} style={{ width: availableWidth > 0 ? `${Math.round(availableWidth * zoom)}px` : "min(100%, 820px)", aspectRatio: `1 / ${aspectRatio}` }}>
    <canvas ref={canvasRef} aria-label={`PDF 第 ${page} 页`} />
    {!rendered ? <div className="atlas-pdf-page-loading">{renderError ? <><AlertTriangle size={20} /><span>第 {page} 页渲染失败</span></> : <><LoaderCircle size={20} className="atlas-spin" /><span>正在渲染第 {page} 页</span></>}</div> : null}
  </article>;
}

export function PdfMaterialViewer({ courseId, materialId, staticSourceUrl, sourcePageCount, segments, activePage, zoom, navigationRequest, onVisiblePageChange, onNavigationSettled, onFatalError }: {
  courseId: string;
  materialId: string;
  staticSourceUrl?: string;
  sourcePageCount: number;
  segments: MaterialSegment[];
  activePage: number;
  zoom: number;
  navigationRequest: MaterialNavigationRequest | null;
  onVisiblePageChange(page: number): void;
  onNavigationSettled(token: number): void;
  onFatalError?(message: string): void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageAspectRatios, setPageAspectRatios] = useState<Map<number, number>>(new Map());
  const [availableWidth, setAvailableWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const pendingRecoveryPageRef = useRef<number | null>(null);
  const pageRecoveryGuardRef = useRef<ReturnType<typeof createPdfPageRecoveryGuard> | null>(null);
  if (!pageRecoveryGuardRef.current) {
    pageRecoveryGuardRef.current = createPdfPageRecoveryGuard(() => setReloadKey((value) => value + 1));
  }
  const pageBySegmentId = useMemo(() => new Map(segments.map((segment) => [segment.id, segment.page ?? segment.order])), [segments]);
  const recoverDocumentAfterPageFailure = useCallback((reason: unknown) => {
    if (pageRecoveryGuardRef.current!.recover(reason)) pendingRecoveryPageRef.current = activePageRef.current;
  }, []);
  const reloadManually = () => {
    pendingRecoveryPageRef.current = null;
    pageRecoveryGuardRef.current!.reset();
    setReloadKey((value) => value + 1);
  };

  useEffect(() => {
    pageRecoveryGuardRef.current!.reset();
    pendingRecoveryPageRef.current = null;
  }, [courseId, materialId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(Math.max(320, entry.contentRect.width - 72)));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    setDocument(null);
    setPageAspectRatios(new Map());
    setError(null);
    loadPdfWithFreshSource({
      resolveSourceUrl: () => resolvePdfSourceUrl(staticSourceUrl, () => getMaterialSourceUrl(courseId, materialId)),
      shouldRefresh: (reason) => !staticSourceUrl && !(reason instanceof Error && reason.name === "PasswordException"),
      load: async (freshSourceUrl) => {
        loadingTask = getDocument({ url: freshSourceUrl });
        try {
          const loaded = await loadingTask.promise;
          if (loaded.numPages !== sourcePageCount) throw new Error(`PDF page count ${loaded.numPages} does not match Material source ${sourcePageCount}`);
          const ratios = await Promise.all(Array.from({ length: loaded.numPages }, async (_, index) => {
            const page = index + 1;
            const viewport = (await loaded.getPage(page)).getViewport({ scale: 1 });
            return [page, viewport.height / viewport.width] as const;
          }));
          return { loaded, ratios };
        } catch (reason) {
          await loadingTask.destroy();
          loadingTask = null;
          throw reason;
        }
      }
    }).then(async ({ loaded, ratios }) => {
      if (disposed) return loadingTask?.destroy();
      setPageAspectRatios(new Map(ratios));
      setDocument(loaded);
    }).catch((reason: unknown) => {
      if (disposed) return;
      const message = reason instanceof Error && reason.name === "PasswordException" ? "该课件 PDF 受密码保护，当前无法打开。" : "课件 PDF 加载失败，请检查文件是否存在或稍后重试。";
      setError(message);
      onFatalError?.(message);
    });
    return () => {
      disposed = true;
      void loadingTask?.destroy();
    };
  }, [courseId, materialId, onFatalError, reloadKey, sourcePageCount, staticSourceUrl]);

  useEffect(() => {
    const page = pendingRecoveryPageRef.current;
    if (!document || page === null) return;
    pendingRecoveryPageRef.current = null;
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-page-number="${page}"]`)?.scrollIntoView({ block: "center" }));
  }, [document]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !document || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<Element, IntersectionObserverEntry>();
    let safetyTimer: number | null = null;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting ? visible.set(entry.target, entry) : visible.delete(entry.target));
      const rootRect = root.getBoundingClientRect();
      const candidates: VisiblePageCandidate[] = Array.from(visible.values()).flatMap((entry) => {
        const element = entry.target as HTMLElement;
        const segmentId = element.dataset.segmentId;
        const page = Number(element.dataset.pageNumber);
        return segmentId && Number.isFinite(page) ? [{ page, segmentId, top: entry.boundingClientRect.top, bottom: entry.boundingClientRect.bottom, intersectionRatio: entry.intersectionRatio }] : [];
      });
      const selected = selectPageAtReadingAnchor(candidates, rootRect.top, rootRect.height);
      if (selected) onVisiblePageChange(selected.page);
      if (navigationRequest && candidates.some((candidate) => candidate.page === navigationRequest.page && (candidate.intersectionRatio >= 0.2 || (candidate.top <= rootRect.top + rootRect.height * 0.42 && candidate.bottom >= rootRect.top + rootRect.height * 0.42)))) {
        if (safetyTimer) window.clearTimeout(safetyTimer);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => onNavigationSettled(navigationRequest.token)));
      }
    }, { root, threshold: [0.05, 0.2, 0.4, 0.65, 0.85] });
    root.querySelectorAll<HTMLElement>("[data-segment-id]").forEach((element) => observer.observe(element));
    if (navigationRequest) {
      const target = root.querySelector<HTMLElement>(`[data-segment-id="${CSS.escape(navigationRequest.segmentId)}"]`);
      if (target && pageBySegmentId.get(navigationRequest.segmentId) === navigationRequest.page) {
        window.requestAnimationFrame(() => target.scrollIntoView({ behavior: navigationRequest.behavior, block: "center" }));
        safetyTimer = window.setTimeout(() => onNavigationSettled(navigationRequest.token), 1800);
      }
    }
    return () => {
      observer.disconnect();
      if (safetyTimer) window.clearTimeout(safetyTimer);
    };
  }, [document, navigationRequest, onNavigationSettled, onVisiblePageChange, pageBySegmentId]);

  return <section className="atlas-lesson-scroll atlas-pdf-scroll" ref={rootRef}>
    {error ? <div className="atlas-pdf-state atlas-pdf-error"><AlertTriangle size={28} /><h2>课件 PDF 加载失败</h2><p>{error}</p><button className="atlas-primary" onClick={reloadManually}><RotateCcw size={15} />重新加载</button></div> : !document ? <div className="atlas-pdf-state"><LoaderCircle size={30} className="atlas-spin" /><h2>正在加载原始 PDF</h2><p>首次打开可能需要几秒钟。</p></div> : <div className="atlas-pdf-pages" style={{ "--pdf-zoom": zoom } as React.CSSProperties}>
      {segments.map((segment) => {
        const page = segment.page ?? segment.order;
        return <PdfPageCanvas key={segment.id} document={document} page={page} segment={segment} availableWidth={availableWidth} zoom={zoom} active={page === activePage} initialAspectRatio={pageAspectRatios.get(page) ?? 1.414} onFatalError={recoverDocumentAfterPageFailure} />;
      })}
    </div>}
  </section>;
}
