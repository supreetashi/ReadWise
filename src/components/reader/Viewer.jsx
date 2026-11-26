import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function Viewer({
  pdfUrl,
  currentPage = 1,
  onPageChange,
  onTextLayerReady,
  onContainerClick,
  textContainerRef,
  activeLine,
  progressX,
}) {
  const canvasRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [textItems, setTextItems] = useState([]);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!pdfUrl) return;

    let isMounted = true;
    setErrorMsg("");
    const loadingTask = pdfjsLib.getDocument(pdfUrl);

    loadingTask.promise
      .then((doc) => {
        if (!isMounted) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      })
      .catch((err) => {
        console.error("Error loading PDF document:", err);
        if (isMounted) setErrorMsg("Could not load PDF file.");
      });

    return () => {
      isMounted = false;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    // Prevent requesting a page past the end of the PDF
    if (currentPage > pdfDoc.numPages) {
      onPageChange?.(pdfDoc.numPages);
      return;
    }

    let renderTask = null;

    pdfDoc.getPage(currentPage).then((page) => {
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const scale = 780 / unscaledViewport.width;
      const viewport = page.getViewport({ scale });

      setViewportSize({ width: viewport.width, height: viewport.height });

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      renderTask = page.render({
        canvasContext: context,
        viewport: viewport,
      });

      renderTask.promise
        .then(() => page.getTextContent())
        .then((content) => {
          const items = content.items
            .filter((item) => item.str.trim().length > 0)
            .map((item, idx) => {
              const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
              return {
                id: idx,
                str: item.str,
                left: tx[4],
                top: tx[5] - item.height * scale,
                fontSize: Math.hypot(tx[0], tx[1]),
                width: item.width * scale,
                height: item.height * scale || 16,
              };
            });

          setTextItems(items);

          setTimeout(() => {
            onTextLayerReady?.();
          }, 80);
        });
    });

    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, currentPage]);

  if (errorMsg) {
    return (
      <div className="p-8 rounded-xl bg-[#15151A] border border-red-500/30 text-center text-sm text-red-400">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center select-text">
      {/* Page Navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-4 mb-4 bg-[#15151A] px-4 py-1.5 rounded-full border border-white/10 text-xs text-white/80">
          <button
            onClick={() => onPageChange?.(Math.max(currentPage - 1, 1))}
            disabled={currentPage <= 1}
            className="hover:text-white disabled:opacity-30 cursor-pointer"
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange?.(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="hover:text-white disabled:opacity-30 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* Canvas & Text Layer */}
      <div
        className="relative shadow-2xl rounded-lg overflow-hidden bg-[#1E1E24] border border-white/10"
        style={{
          width: viewportSize.width || "auto",
          height: viewportSize.height || "auto",
        }}
      >
        <canvas ref={canvasRef} className="block" />

        {/* Ruler Overlay */}
        {activeLine && (
          <div
            className="pointer-events-none absolute z-30 rounded overflow-hidden bg-readflow-gold/[0.15] border-l-2 border-readflow-gold shadow-[0_0_12px_rgba(229,192,123,0.3)] will-change-transform"
            style={{
              top: `${activeLine.top - 2}px`,
              left: `${activeLine.left - 4}px`,
              width: `${activeLine.width + 8}px`,
              height: `${activeLine.height + 4}px`,
            }}
          >
            <div
              className="h-full bg-gradient-to-r from-transparent via-readflow-gold/25 to-readflow-gold/60 border-r-2 border-readflow-gold shadow-[0_0_10px_rgba(229,192,123,0.5)] will-change-[width]"
              style={{ width: `${progressX}%` }}
            />
          </div>
        )}

        {/* Transparent Text Layer */}
        <div
          ref={textContainerRef}
          onClick={onContainerClick}
          className="absolute inset-0 pointer-events-auto cursor-pointer"
          style={{ width: viewportSize.width, height: viewportSize.height }}
        >
          {textItems.map((item) => (
            <p
              key={item.id}
              className="absolute whitespace-pre select-text text-transparent hover:text-transparent selection:bg-[#E50914]/30"
              style={{
                left: `${item.left}px`,
                top: `${item.top}px`,
                fontSize: `${item.fontSize}px`,
                height: `${item.height}px`,
                lineHeight: `${item.height}px`,
              }}
            >
              {item.str}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}