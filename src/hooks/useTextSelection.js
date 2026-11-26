import { useState, useEffect, useCallback } from "react";

function extractSurroundingContext(range, selectedText) {
  try {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    // Walk up to the nearest paragraph or readable block inside the container
    const block = node?.closest?.("p, div.textLayer, span");
    const raw = (block?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw || raw.length <= selectedText.length) return "";

    if (raw.length <= 450) return raw;

    const idx = raw.indexOf(selectedText);
    if (idx === -1) return raw.slice(0, 450);

    const start = Math.max(0, idx - 180);
    const end = Math.min(raw.length, idx + selectedText.length + 180);
    return `${start > 0 ? "…" : ""}${raw.slice(start, end)}${end < raw.length ? "…" : ""}`;
  } catch {
    return "";
  }
}

export function useTextSelection(containerRef) {
  const [selectedText, setSelectedText] = useState("");
  const [selectedContext, setSelectedContext] = useState("");
  const [toolbarPosition, setToolbarPosition] = useState(null);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectedText((prev) => (prev ? "" : prev));
      setSelectedContext((prev) => (prev ? "" : prev));
      setToolbarPosition((prev) => (prev ? null : prev));
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0) return;

    if (
      containerRef?.current &&
      !containerRef.current.contains(selection.anchorNode)
    ) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const centerLeft = rect.left + rect.width / 2;
    const clampedLeft = Math.max(150, Math.min(window.innerWidth - 150, centerLeft));
    const clampedTop = Math.max(12, rect.top - 56);

    setToolbarPosition({
      top: clampedTop,
      left: clampedLeft,
    });
    setSelectedText(text);
    setSelectedContext(extractSurroundingContext(range, text));
  }, [containerRef]);

  useEffect(() => {
    const onMouseUp = () => handleSelectionChange();
    const onKeyUp = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Control" || e.key === "Meta") {
        return;
      }
      handleSelectionChange();
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);

    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [handleSelectionChange]);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
    setSelectedContext("");
    setToolbarPosition(null);
  }, []);

  return {
    selectedText,
    selectedContext,
    toolbarPosition,
    clearSelection,
  };
}
