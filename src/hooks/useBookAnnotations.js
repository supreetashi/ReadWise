import { useState, useEffect, useCallback } from "react";

export function useBookAnnotations(bookKey) {
  const storageKey = `readwise_annotations_${bookKey || "default"}`;

  const [annotations, setAnnotations] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setAnnotations(saved ? JSON.parse(saved) : []);
    } catch {
      setAnnotations([]);
    }
  }, [storageKey]);

  const saveToStorage = useCallback(
    (nextList) => {
      setAnnotations(nextList);
      try {
        localStorage.setItem(storageKey, JSON.stringify(nextList));
      } catch (err) {
        console.error("Failed to save annotations:", err);
      }
    },
    [storageKey]
  );

  const addAnnotation = useCallback(
    ({ text, page = 1, note = "", type = "highlight" }) => {
      if (!text?.trim()) return;
      const newItem = {
        id: Date.now().toString(),
        text: text.trim(),
        page,
        note: note.trim(),
        type,
        createdAt: new Date().toLocaleDateString(),
      };
      saveToStorage([newItem, ...annotations]);
      return newItem;
    },
    [annotations, saveToStorage]
  );

  const updateNote = useCallback(
    (id, note) => {
      const updated = annotations.map((item) =>
        item.id === id ? { ...item, note } : item
      );
      saveToStorage(updated);
    },
    [annotations, saveToStorage]
  );

  const removeAnnotation = useCallback(
    (id) => {
      saveToStorage(annotations.filter((item) => item.id !== id));
    },
    [annotations, saveToStorage]
  );

  return {
    annotations,
    addAnnotation,
    updateNote,
    removeAnnotation,
  };
}