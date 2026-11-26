import { useState, useCallback } from "react";

const PROGRESS_KEY = "readwise_reading_progress";

export function getSavedProgressMap() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useReadingProgress(bookId) {
  const [progress, setProgress] = useState(() => {
    const all = getSavedProgressMap();
    return (
      all[bookId] || {
        page: 1,
        lineIdx: 0,
        wpm: 260,
        percentage: 0,
        updatedAt: Date.now(),
      }
    );
  });

  const saveProgress = useCallback(
    (updates) => {
      if (!bookId) return;
      setProgress((prev) => {
        const next = { ...prev, ...updates, updatedAt: Date.now() };
        try {
          const all = getSavedProgressMap();
          all[bookId] = next;
          localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
        } catch (err) {
          console.error("Failed to save progress:", err);
        }
        return next;
      });
    },
    [bookId]
  );

  return { progress, saveProgress };
}