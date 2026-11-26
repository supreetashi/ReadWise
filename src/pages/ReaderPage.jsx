import { useEffect, useRef, useState, useCallback } from "react";
import { useReadingRuler } from "../hooks/useReadingRuler";
import { useTextSelection } from "../hooks/useTextSelection";
import { useBookAnnotations } from "../hooks/useBookAnnotations";
import { useReadingProgress } from "../hooks/useReadingProgress";
import PacerBar from "../components/reader/PacerBar";
import SelectionToolbar from "../components/reader/SelectionToolbar";
import AISidebar from "../components/ai/AISidebar";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { fetchBookPages } from "../utils/bookApi";
import { extractPagesFromFile } from "../utils/pdfTextExtractor";

export default function ReaderPage({ book, onBack }) {
  const textRef = useRef(null);
  const hasRestoredRef = useRef(false);

  const bookIdentifier = book?.id || book?.title || "default_book";
  const { progress, saveProgress } = useReadingProgress(bookIdentifier);

  const preloadedPages =
    Array.isArray(book?.pages) && book.pages.length > 0 ? book.pages : null;

  const [currentPage, setCurrentPage] = useState(
    preloadedPages
      ? Math.min(Math.max(1, progress.page || 1), preloadedPages.length)
      : progress.page || 1
  );
  const [totalPages, setTotalPages] = useState(preloadedPages?.length || 1);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("ai");

  // Book text fetched from Gutenberg/mirrors or extracted from legacy uploaded PDF
  const [retryCount, setRetryCount] = useState(0);
  const [textState, setTextState] = useState({
    key: null,
    pages: null,
    error: null,
  });

  const { annotations, addAnnotation, updateNote, removeAnnotation } =
    useBookAnnotations(bookIdentifier);

  const needsExtract = Boolean(
    !preloadedPages && (book?.fileBlob || book?.pdfUrl)
  );
  const needsTextFetch = Boolean(
    !preloadedPages &&
      !needsExtract &&
      (book?.textUrl || book?.gutenbergId || book?.archiveIdentifier)
  );
  const needsAsyncLoad = needsExtract || needsTextFetch;
  const currentFetchKey = `${book?.id || ""}_${retryCount}`;
  const textLoading = needsAsyncLoad && textState.key !== currentFetchKey;
  const bookPages =
    preloadedPages ||
    (textState.key === currentFetchKey ? textState.pages : null);
  const textError =
    !preloadedPages && textState.key === currentFetchKey
      ? textState.error
      : null;

  // Fetch catalog text or extract text from legacy uploaded PDF
  useEffect(() => {
    if (!needsAsyncLoad) return;
    let cancelled = false;
    const loader = needsExtract
      ? extractPagesFromFile(book.fileBlob || book.pdfUrl)
      : fetchBookPages(book);

    loader
      .then((pages) => {
        if (cancelled) return;
        if (pages) {
          setTextState({ key: currentFetchKey, pages, error: null });
          setTotalPages(pages.length);
          setCurrentPage((prev) => Math.min(Math.max(1, prev), pages.length));
        } else {
          setTextState({
            key: currentFetchKey,
            pages: null,
            error: "No readable text found for this book.",
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTextState({
            key: currentFetchKey,
            pages: null,
            error:
              err?.message ||
              "Failed to load book text. Please try again.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [book, needsAsyncLoad, needsExtract, currentFetchKey]);

  const handlePageEnd = useCallback(() => {
    setCurrentPage((prevPage) => {
      if (prevPage >= totalPages) return prevPage;
      window.scrollTo({ top: 0, behavior: "smooth" });
      return prevPage + 1;
    });
  }, [totalPages]);

  const {
    activeLine,
    lineRects,
    currentLineIdx,
    progressX,
    isPlaying,
    togglePlay,
    wpm,
    increaseSpeed,
    decreaseSpeed,
    recalculate,
    resetToStart,
    jumpToLine,
  } = useReadingRuler(textRef, progress.wpm || 260, handlePageEnd);

  const { selectedText, selectedContext, toolbarPosition, clearSelection } =
    useTextSelection(textRef);

  // Recalculate reading ruler line rects whenever pages load or page changes
  useEffect(() => {
    if (bookPages) {
      const frame = requestAnimationFrame(() => recalculate?.());
      return () => cancelAnimationFrame(frame);
    }
  }, [bookPages, currentPage, recalculate]);

  // Restore saved line index on initial render
  useEffect(() => {
    if (
      !hasRestoredRef.current &&
      lineRects.length > 0 &&
      progress.lineIdx > 0
    ) {
      hasRestoredRef.current = true;
      jumpToLine(Math.min(progress.lineIdx, lineRects.length - 1));
    }
  }, [lineRects.length, progress.lineIdx, jumpToLine]);

  // Persist page, line index, WPM, and completion percentage automatically
  useEffect(() => {
    const pct =
      totalPages > 1
        ? Math.min(100, Math.round((currentPage / totalPages) * 100))
        : lineRects.length > 0
        ? Math.min(100, Math.round(((currentLineIdx + 1) / lineRects.length) * 100))
        : 10;

    saveProgress({
      page: currentPage,
      lineIdx: currentLineIdx,
      wpm,
      percentage: pct,
    });
  }, [
    currentPage,
    currentLineIdx,
    wpm,
    totalPages,
    lineRects.length,
    saveProgress,
  ]);

  const handlePageChange = useCallback(
    (newPage) => {
      setCurrentPage(newPage);
      resetToStart();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [resetToStart]
  );

  const handleContainerClick = (e) => {
    const selection = window.getSelection();
    if (
      selection &&
      !selection.isCollapsed &&
      selection.toString().trim().length > 0
    ) {
      return;
    }

    if (!textRef.current || !lineRects?.length) return;

    const containerRect = textRef.current.getBoundingClientRect();
    const clickY = e.clientY - containerRect.top + textRef.current.scrollTop;

    const clickedIdx = lineRects.findIndex(
      (line) => clickY >= line.top - 6 && clickY <= line.top + line.height + 6
    );

    if (clickedIdx !== -1) {
      jumpToLine(clickedIdx);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "Escape") {
        if (isAiOpen) {
          setIsAiOpen(false);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, onBack, isAiOpen]);

  useEffect(() => {
    if (!isPlaying || !activeLine || !textRef.current) return;

    const containerRect = textRef.current.getBoundingClientRect();
    const lineScreenTop = containerRect.top + activeLine.top;
    const targetEyeLevel = window.innerHeight * 0.45;

    if (lineScreenTop > targetEyeLevel) {
      const scrollOffset = lineScreenTop - targetEyeLevel;
      window.scrollBy({
        top: scrollOffset,
        behavior: "smooth",
      });
    }
  }, [activeLine, isPlaying]);

  return (
    <div className="relative min-h-screen bg-[#0B0B0E] text-[#E0E0E6] select-text">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-8 py-4 bg-[#0B0B0E]/80 backdrop-blur-md border-b border-white/5">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition cursor-pointer"
        >
          <FontAwesomeIcon icon={faArrowLeft} /> Exit to Library
        </button>

        <span className="text-sm font-semibold tracking-wide text-white/90">
          {book?.title || "Reader"}
        </span>

        <button
          onClick={() => {
            setSidebarTab("ai");
            setIsAiOpen((prev) => !prev);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
            isAiOpen
              ? "bg-readflow-gold/20 text-readflow-gold border-readflow-gold/40"
              : "bg-white/5 text-white/70 border-white/10 hover:text-white hover:bg-white/10"
          }`}
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} />
          <span>
            AI & Notes {annotations.length > 0 ? `(${annotations.length})` : ""}
          </span>
        </button>
      </header>

      {/* Floating Selection Toolbar */}
      <SelectionToolbar
        position={toolbarPosition}
        onHighlight={() => {
          addAnnotation({
            text: selectedText,
            page: currentPage,
            type: "highlight",
          });
          clearSelection();
        }}
        onNote={() => {
          addAnnotation({
            text: selectedText,
            page: currentPage,
            type: "note",
          });
          setSidebarTab("notes");
          setIsAiOpen(true);
          clearSelection();
        }}
        onExplain={() => {
          setActiveSnippet({
            id: Date.now(),
            text: selectedText,
            context: selectedContext,
          });
          setSidebarTab("ai");
          setIsAiOpen(true);
          clearSelection();
        }}
        onCopy={() => {
          navigator.clipboard.writeText(selectedText);
          clearSelection();
        }}
      />

      {/* AI Assistant & Notes Sidebar */}
      <AISidebar
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        initialTab={sidebarTab}
        selectedSnippet={activeSnippet}
        onClearSnippet={() => setActiveSnippet(null)}
        bookTitle={book?.title}
        bookAuthor={book?.author}
        annotations={annotations}
        onUpdateNote={updateNote}
        onDeleteAnnotation={removeAnnotation}
        onJumpToPage={handlePageChange}
      />

      {/* Main Reading Area */}
      <main
        className={`max-w-4xl mx-auto px-6 py-12 pb-32 transition-all duration-300 ${
          isAiOpen ? "sm:mr-[440px]" : ""
        }`}
      >
        <h1 className="text-3xl font-bold font-sans text-white mb-2">
          {book?.title || "Chapter 1"}
        </h1>
        <p className="text-sm text-readflow-gold font-sans mb-8">
          By {book?.author || "Public Domain Author"}
        </p>

        {textLoading ? (
          <div className="text-center text-white/50 py-24 animate-pulse">
            Loading "{book?.title}"…
          </div>
        ) : textError ? (
          <div className="text-center py-24 space-y-4">
            <p className="text-red-400/70">{textError}</p>
            <div className="text-white/40 text-sm max-w-md mx-auto space-y-3">
              {book?.synopsis && (
                <p className="text-white/50 italic text-base">{book.synopsis}</p>
              )}
              <button
                onClick={() => setRetryCount((c) => c + 1)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition cursor-pointer"
              >
                Retry Loading Book
              </button>
            </div>
          </div>
        ) : bookPages ? (
          <>
            {/* Pagination header */}
            <div className="flex justify-between items-center text-xs text-white/30 mb-6 font-sans select-none">
              <span>Page {currentPage} of {bookPages.length}</span>
              <div className="flex gap-3">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  ← Prev
                </button>
                <button
                  disabled={currentPage >= bookPages.length}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="px-3 py-1 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Real text content */}
            <div
              ref={textRef}
              onClick={handleContainerClick}
              className="relative text-lg leading-[38px] font-serif space-y-6 text-gray-300 cursor-pointer"
            >
              {activeLine && (
                <div
                  className="pointer-events-none absolute rounded overflow-hidden bg-readflow-gold/[0.08] border-l-2 border-readflow-gold shadow-[0_0_12px_rgba(229,192,123,0.15)] will-change-transform"
                  style={{
                    top: `${activeLine.top - 2}px`,
                    left: `${activeLine.left - 4}px`,
                    width: `${activeLine.width + 8}px`,
                    height: `${activeLine.height + 4}px`,
                  }}
                >
                  <div
                    className="h-full bg-gradient-to-r from-transparent via-readflow-gold/20 to-readflow-gold/60 border-r-2 border-readflow-gold shadow-[0_0_10px_rgba(229,192,123,0.5)] will-change-[width]"
                    style={{ width: `${progressX}%` }}
                  />
                </div>
              )}

              {(bookPages[currentPage - 1] || []).map((para, i) => (
                <p key={i} className="block">
                  {para}
                </p>
              ))}
            </div>

            {/* Pagination footer */}
            <div className="flex justify-center gap-4 mt-10 font-sans">
              <button
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm cursor-pointer"
              >
                ← Previous Page
              </button>
              <button
                disabled={currentPage >= bookPages.length}
                onClick={() => handlePageChange(currentPage + 1)}
                className="px-5 py-2 rounded-lg bg-readflow-primary hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm cursor-pointer"
              >
                Next Page →
              </button>
            </div>
          </>
        ) : (
          <div
            ref={textRef}
            onClick={handleContainerClick}
            className="relative text-lg leading-[38px] font-serif space-y-6 text-gray-300 cursor-pointer"
          >
            {activeLine && (
              <div
                className="pointer-events-none absolute rounded overflow-hidden bg-readflow-gold/[0.08] border-l-2 border-readflow-gold shadow-[0_0_12px_rgba(229,192,123,0.15)] will-change-transform"
                style={{
                  top: `${activeLine.top - 2}px`,
                  left: `${activeLine.left - 4}px`,
                  width: `${activeLine.width + 8}px`,
                  height: `${activeLine.height + 4}px`,
                }}
              >
                <div
                  className="h-full bg-gradient-to-r from-transparent via-readflow-gold/20 to-readflow-gold/60 border-r-2 border-readflow-gold shadow-[0_0_10px_rgba(229,192,123,0.5)] will-change-[width]"
                  style={{ width: `${progressX}%` }}
                />
              </div>
            )}
            <p className="block text-white/40 italic">
              No readable text is available for this book yet.
            </p>
          </div>
        )}
      </main>

      {/* Floating Bottom Pacer Controls */}
      <PacerBar
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        wpm={wpm}
        onIncrease={increaseSpeed}
        onDecrease={decreaseSpeed}
      />
    </div>
  );
}