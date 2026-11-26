import { paginateParagraphs } from "./bookApi";

/**
 * Reconstruct readable lines and paragraphs from a PDF.js page textContent result.
 */
function textItemsToParagraphs(items = []) {
  const lines = [];
  let currentLine = "";
  let prevY = null;
  let prevFontHeight = 12;

  for (const item of items) {
    const str = item?.str ?? "";
    if (!str && !item?.hasEOL) continue;

    const y = item.transform?.[5];
    const fontHeight = Math.abs(item.transform?.[3] || item.height || 12) || 12;

    if (prevY !== null && typeof y === "number") {
      const yDiff = Math.abs(prevY - y);
      // Significant vertical jump indicates a new line or paragraph
      if (yDiff > prevFontHeight * 0.6) {
        if (currentLine.trim()) {
          lines.push({ text: currentLine.trim(), gapAfter: yDiff > prevFontHeight * 1.6 });
        }
        currentLine = str;
      } else {
        // Same visual line — add space if needed
        const needsSpace =
          currentLine.length > 0 &&
          !currentLine.endsWith(" ") &&
          !str.startsWith(" ");
        currentLine += (needsSpace ? " " : "") + str;
      }
    } else {
      currentLine += str;
    }

    if (typeof y === "number") {
      prevY = y;
      prevFontHeight = fontHeight;
    }

    if (item.hasEOL && currentLine.trim()) {
      lines.push({ text: currentLine.trim(), gapAfter: false });
      currentLine = "";
      prevY = null;
    }
  }

  if (currentLine.trim()) {
    lines.push({ text: currentLine.trim(), gapAfter: false });
  }

  // Merge wrapped lines into paragraphs
  const paragraphs = [];
  let buffer = "";

  for (const line of lines) {
    const clean = line.text.replace(/\s+/g, " ").trim();
    if (!clean) continue;

    // De-hyphenate line-end breaks like "won- derland"
    if (buffer.endsWith("-")) {
      buffer = buffer.slice(0, -1) + clean;
    } else {
      buffer = buffer ? `${buffer} ${clean}` : clean;
    }

    if (line.gapAfter || /[.!?]["”']?$/.test(clean) && buffer.length > 180) {
      paragraphs.push(buffer);
      buffer = "";
    }
  }
  if (buffer.trim()) {
    paragraphs.push(buffer.trim());
  }

  return paragraphs;
}

/**
 * Extract clean paginated paragraphs from an uploaded .pdf or .txt File / Blob.
 * Lazily loads pdfjs-dist only when a PDF is actually opened or uploaded.
 */
export async function extractPagesFromFile(fileOrUrl) {
  if (!fileOrUrl) return null;

  // Handle plain-text files directly without loading PDF.js
  if (
    typeof fileOrUrl !== "string" &&
    (fileOrUrl.type === "text/plain" || /\.txt$/i.test(fileOrUrl.name || ""))
  ) {
    const raw = await fileOrUrl.text();
    const paragraphs = raw
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.replace(/\r?\n/g, " ").trim())
      .filter((p) => p.length > 0);
    return paginateParagraphs(paragraphs);
  }

  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const loadingTask =
    typeof fileOrUrl === "string"
      ? pdfjsLib.getDocument(fileOrUrl)
      : pdfjsLib.getDocument({ data: await fileOrUrl.arrayBuffer() });

  const pdfDoc = await loadingTask.promise;
  const allParagraphs = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageParagraphs = textItemsToParagraphs(content.items);
    allParagraphs.push(...pageParagraphs);
  }

  const pages = paginateParagraphs(allParagraphs);
  if (!pages) {
    throw new Error(
      "No extractable text found in this PDF (it may contain only scanned images)."
    );
  }
  return pages;
}
