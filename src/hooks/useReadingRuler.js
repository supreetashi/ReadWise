import { useState, useEffect, useRef, useCallback } from "react";

export function useReadingRuler(contentRef, initialWpm = 250, onPageEnd = null) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(initialWpm);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [progressX, setProgressX] = useState(0);
  const [lineRects, setLineRects] = useState([]);

  const isPlayingRef = useRef(false);
  const wpmRef = useRef(initialWpm);
  const lineIdxRef = useRef(0);
  const progressXRef = useRef(0);
  const lineRectsRef = useRef([]);
  const requestRef = useRef(null);
  const lastTimeRef = useRef(null);
  const onPageEndRef = useRef(onPageEnd);

  isPlayingRef.current = isPlaying;
  wpmRef.current = wpm;
  onPageEndRef.current = onPageEnd;

  const computeLines = useCallback(() => {
    if (!contentRef.current) return;

    const container = contentRef.current;
    const containerRect = container.getBoundingClientRect();
    const paragraphs = container.querySelectorAll("p");
    const extracted = [];

    paragraphs.forEach((p) => {
      const text = p.innerText.trim();
      if (!text) return;

      const range = document.createRange();
      range.selectNodeContents(p);
      const rects = Array.from(range.getClientRects());

      rects.forEach((r) => {
        if (r.width > 20 && r.height > 10) {
          extracted.push({
            top: r.top - containerRect.top + container.scrollTop,
            left: r.left - containerRect.left,
            width: r.width,
            height: r.height,
          });
        }
      });
    });

    if (extracted.length > 0) {
      lineRectsRef.current = extracted;
      setLineRects(extracted);
    }
  }, [contentRef]);

  // Reset ruler back to line 0 (called on page transition)
  const resetToStart = useCallback(() => {
    lineIdxRef.current = 0;
    progressXRef.current = 0;
    setCurrentLineIdx(0);
    setProgressX(0);
  }, []);

  // Snap ruler directly to a specific line index
  const jumpToLine = useCallback((index) => {
    if (index >= 0 && index < lineRectsRef.current.length) {
      lineIdxRef.current = index;
      progressXRef.current = 0;
      setCurrentLineIdx(index);
      setProgressX(0);
    }
  }, []);

  useEffect(() => {
    computeLines();
    const handleResize = () => computeLines();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [computeLines]);

  const animate = useCallback((time) => {
    if (!isPlayingRef.current) return;

    if (lastTimeRef.current !== null) {
      const delta = (time - lastTimeRef.current) / 1000;
      const safeDelta = Math.min(delta, 0.1);

      const secondsPerLine = (10 / wpmRef.current) * 60;
      const stepPercent = (100 / Math.max(secondsPerLine, 0.5)) * safeDelta;

      progressXRef.current += stepPercent;

      if (progressXRef.current >= 100) {
        progressXRef.current = 0;
        const totalLines = lineRectsRef.current.length;

        if (lineIdxRef.current + 1 < totalLines) {
          lineIdxRef.current += 1;
          setCurrentLineIdx(lineIdxRef.current);
        } else {
          // Reached the end of the page!
          if (onPageEndRef.current) {
            onPageEndRef.current();
          } else {
            isPlayingRef.current = false;
            setIsPlaying(false);
          }
        }
      }

      setProgressX(progressXRef.current);
    }

    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = null;
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, animate]);

  const togglePlay = () => setIsPlaying((prev) => !prev);
  const increaseSpeed = () => setWpm((prev) => Math.min(prev + 25, 800));
  const decreaseSpeed = () => setWpm((prev) => Math.max(prev - 25, 50));

  const activeLine = lineRects[currentLineIdx] || null;

  return {
    activeLine,
    lineRects,
    progressX,
    isPlaying,
    togglePlay,
    wpm,
    increaseSpeed,
    decreaseSpeed,
    currentLineIdx,
    recalculate: computeLines,
    resetToStart,
    jumpToLine,
  };
}