const GUTENDEX_BASE = "https://gutendex.com/books";
const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const CATALOG_CACHE_KEY = "readwise_catalog_cache_v2";

// In-memory caches
const pagesCache = new Map();
const olCoverCache = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchWithTimeout(url, ms = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() =>
    clearTimeout(id)
  );
}

/**
 * GitHub Pages is static-only; local Vite dev and Vercel host /api/* endpoints.
 */
export function hasBackendApi() {
  if (import.meta.env.DEV) return true;
  if (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")) {
    return false;
  }
  return true;
}

function isValidBookText(text) {
  if (!text || text.length < 500) return false;
  const head = text.slice(0, 600);
  if (/REDACTED_BY_IA_S3|x-archive-meta|<html[\s>]|<!DOCTYPE html/i.test(head)) {
    return false;
  }
  return true;
}

function getGitenbergSlugCandidates(title = "") {
  const slugs = new Set();
  const toSlug = (s) =>
    s
      .replace(/['’`]/g, "")
      .replace(/[^a-zA-Z0-9\s-]/g, " ")
      .trim()
      .split(/\s+/)
      .join("-");

  if (title) slugs.add(toSlug(title));
  const mainTitle = title.split(/[;:]/)[0].trim();
  if (mainTitle) slugs.add(toSlug(mainTitle));
  return Array.from(slugs).filter(Boolean);
}

function getGitHubRawUrls(gutenbergId, title) {
  if (!gutenbergId) return [];
  const urls = [];
  for (const slug of getGitenbergSlugCandidates(title)) {
    urls.push(
      `https://raw.githubusercontent.com/GITenberg/${slug}_${gutenbergId}/master/${gutenbergId}-0.txt`,
      `https://raw.githubusercontent.com/GITenberg/${slug}_${gutenbergId}/master/${gutenbergId}-8.txt`,
      `https://raw.githubusercontent.com/GITenberg/${slug}_${gutenbergId}/master/${gutenbergId}.txt`
    );
  }
  return urls;
}

function pickBestArchiveTxtFile(files = [], gutenbergId = "") {
  const validTxt = files.filter((f) => {
    const name = f?.name || "";
    if (!name.toLowerCase().endsWith(".txt")) return false;
    if (/_meta\.txt$|_files\.txt$|_s3.*\.txt$|readme/i.test(name)) return false;
    if (f.size && Number(f.size) < 2000) return false;
    return true;
  });
  if (validTxt.length === 0) return null;

  if (gutenbergId) {
    const preferred = [
      `${gutenbergId}-0.txt`,
      `${gutenbergId}-8.txt`,
      `${gutenbergId}.txt`,
      `pg${gutenbergId}.txt`,
    ];
    for (const pName of preferred) {
      const m = validTxt.find((f) => f.name.toLowerCase() === pName.toLowerCase());
      if (m) return m;
    }
  }
  return (
    validTxt.find((f) => f.name.endsWith("_djvu.txt")) ||
    validTxt.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0]
  );
}

async function fetchArchiveItemText(identifier, gutenbergId) {
  const metaRes = await fetchWithTimeout(
    `https://archive.org/metadata/${identifier}/files`,
    6000
  );
  if (!metaRes.ok) return null;
  const meta = await metaRes.json();
  const txtFile = pickBestArchiveTxtFile(meta.result, gutenbergId);
  if (!txtFile) return null;

  const txtRes = await fetchWithTimeout(
    `https://archive.org/download/${identifier}/${encodeURIComponent(txtFile.name)}`,
    12000
  );
  if (!txtRes.ok) return null;
  const text = await txtRes.text();
  return isValidBookText(text) ? text : null;
}

async function fetchFromArchiveBrowser(gutenbergId, title, archiveIdentifier = null) {
  if (archiveIdentifier) {
    try {
      const text = await fetchArchiveItemText(archiveIdentifier, gutenbergId);
      if (text) return text;
    } catch {
      // fall through to search
    }
  }

  const queries = [];
  if (gutenbergId) {
    queries.push(`collection:gutenberg AND "gutenberg etext# ${gutenbergId}"`);
  }
  if (title) {
    const cleanTitle = title.split(/[;:]/)[0].replace(/["']/g, "").trim();
    if (cleanTitle) {
      queries.push(`title:("${cleanTitle}") AND collection:gutenberg`);
    }
  }

  for (const query of queries) {
    try {
      const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
        query
      )}&fl[]=identifier&sort[]=downloads+desc&rows=2&output=json`;
      const res = await fetchWithTimeout(searchUrl, 7000);
      if (!res.ok) continue;
      const data = await res.json();

      for (const doc of data.response?.docs || []) {
        const text = await fetchArchiveItemText(doc.identifier, gutenbergId);
        if (text) return text;
      }
    } catch {
      // try next query
    }
  }
  return null;
}

/**
 * Returns the serverless/dev proxy cover URL.
 */
export function getBookCoverProxyUrl(book) {
  if (!hasBackendApi()) return null;
  const params = new URLSearchParams();
  if (book?.gutenbergId) params.set("id", String(book.gutenbergId));
  if (book?.title) params.set("title", book.title);
  if (book?.author) params.set("author", book.author);
  return `/api/book-cover?${params.toString()}`;
}

/**
 * Client-side CORS-enabled Open Library cover lookup (works on static hosts too).
 */
export async function resolveOpenLibraryCover(book) {
  const cleanTitle = (book?.title || "").split(/[;:]/)[0].trim();
  if (!cleanTitle) return null;

  const key = `${cleanTitle}_${book?.author || ""}`;
  if (olCoverCache.has(key)) return olCoverCache.get(key);

  try {
    const url = `${OPEN_LIBRARY_SEARCH}?title=${encodeURIComponent(cleanTitle)}${
      book?.author ? `&author=${encodeURIComponent(book.author)}` : ""
    }&limit=1&fields=cover_i`;
    const res = await fetchWithTimeout(url, 6000);
    if (res.ok) {
      const data = await res.json();
      const coverId = data.docs?.[0]?.cover_i;
      if (coverId) {
        const cover = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
        olCoverCache.set(key, cover);
        return cover;
      }
    }
  } catch {
    // ignore
  }
  olCoverCache.set(key, null);
  return null;
}

/**
 * Fetch a Gutenberg book's plain text across dev/Vercel proxy + CORS-enabled mirrors.
 */
async function fetchGutenbergTextString(rawUrl, gutenbergId, title, archiveIdentifier = null) {
  // 1. Vite dev middleware or Vercel serverless /api/book-text
  if (hasBackendApi()) {
    const params = new URLSearchParams();
    if (rawUrl) params.set("url", rawUrl);
    if (gutenbergId) params.set("id", String(gutenbergId));
    if (title) params.set("title", title);

    try {
      const r = await fetchWithTimeout(`/api/book-text?${params.toString()}`, 25000);
      if (r.ok) {
        const contentType = r.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          const text = await r.text();
          if (isValidBookText(text)) return text;
        }
      }
    } catch {
      // static host without /api — fall through to client-side CORS mirrors
    }
  }

  // 2. Direct GITenberg raw mirror (CORS-enabled)
  for (const url of getGitHubRawUrls(gutenbergId, title)) {
    try {
      const r = await fetchWithTimeout(url, 9000);
      if (r.ok) {
        const text = await r.text();
        if (isValidBookText(text)) return text;
      }
    } catch {
      // try next
    }
  }

  // 3. Direct Internet Archive Gutenberg collection (CORS-enabled)
  const iaText = await fetchFromArchiveBrowser(gutenbergId, title, archiveIdentifier);
  if (iaText) return iaText;

  // 4. Public CORS proxies as last resort
  if (rawUrl) {
    for (const proxyUrl of [
      `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`,
    ]) {
      try {
        const r = await fetchWithTimeout(proxyUrl, 12000);
        if (r.ok) {
          const text = await r.text();
          if (isValidBookText(text)) return text;
        }
      } catch {
        // try next
      }
    }
  }

  throw new Error("All text sources exhausted");
}

// ─── SVG Cover generator (no network required) ────────────────────────────────
export function generateBookCoverSvg(title = "", author = "", id = 0) {
  const palettes = [
    ["#1a1a2e", "#e94560", "#0f3460"],
    ["#2d1b4e", "#c084fc", "#7c3aed"],
    ["#064e3b", "#6ee7b7", "#065f46"],
    ["#7f1d1d", "#fca5a5", "#991b1b"],
    ["#1e3a5f", "#93c5fd", "#1d4ed8"],
    ["#44403c", "#fbbf24", "#78350f"],
    ["#1f2937", "#34d399", "#065f46"],
    ["#312e81", "#a5b4fc", "#4338ca"],
  ];
  const p = palettes[Math.abs(Number(id) || 0) % palettes.length];
  const [bg, accent, mid] = p;

  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const words = title.split(" ");
  let line1 = "",
    line2 = "";
  for (const w of words) {
    if ((line1 + " " + w).trim().length <= 18) line1 = (line1 + " " + w).trim();
    else if ((line2 + " " + w).trim().length <= 20) line2 = (line2 + " " + w).trim();
  }
  const shortAuthor = author.length > 24 ? author.slice(0, 22) + "…" : author;

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="200" height="300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${mid}"/>
    </linearGradient>
  </defs>
  <rect width="200" height="300" fill="url(#bg)"/>
  <rect x="0" y="0" width="8" height="300" fill="${accent}" opacity="0.9"/>
  <rect x="20" y="38" width="160" height="2" fill="${accent}" opacity="0.5"/>
  <rect x="20" y="260" width="160" height="2" fill="${accent}" opacity="0.4"/>
  <circle cx="110" cy="65" r="20" fill="${accent}" opacity="0.15"/>
  <text x="110" y="65" font-family="serif" font-size="22" fill="${accent}" text-anchor="middle" dominant-baseline="middle" opacity="0.8">❧</text>
  <text x="110" y="${line2 ? "140" : "150"}" font-family="Georgia,serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${esc(line1)}</text>
  ${line2 ? `<text x="110" y="168" font-family="Georgia,serif" font-size="18" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${esc(line2)}</text>` : ""}
  <text x="110" y="240" font-family="Arial,sans-serif" font-size="11" fill="${accent}" text-anchor="middle" opacity="0.9">${esc(shortAuthor)}</text>
</svg>`;

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
}

// Normalize a Gutendex API book item
function normalizeGutendexBook(item) {
  const authorName =
    item.authors?.[0]?.name
      ?.split(",")
      .reverse()
      .map((s) => s.trim())
      .join(" ") || "Classic Author";

  const generatedCover = generateBookCoverSvg(item.title, authorName, item.id);
  const coverUrl = item.formats?.["image/jpeg"] || generatedCover;

  const textUrl =
    item.formats?.["text/plain; charset=utf-8"] ||
    item.formats?.["text/plain; charset=us-ascii"] ||
    item.formats?.["text/plain"] ||
    null;

  const subject = item.subjects?.[0] || "Classic Literature";

  return {
    id: `gutenberg_${item.id}`,
    gutenbergId: item.id,
    title: item.title,
    author: authorName,
    coverUrl,
    generatedCover,
    synopsis: `${subject}. Downloaded ${
      item.download_count?.toLocaleString() || "thousands of"
    } times on Project Gutenberg.`,
    textUrl,
    subjects: item.subjects || [],
  };
}

function normalizeArchiveBook(doc) {
  const callNum = Array.isArray(doc.call_number) ? doc.call_number[0] : doc.call_number || "";
  const idMatch = String(callNum).match(/(\d+)/);
  const gutenbergId = idMatch ? Number(idMatch[1]) : null;
  const rawCreator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator || "Classic Author";
  const authorName = rawCreator
    .replace(/,\s*\d{4}-(\d{4})?/g, "")
    .split(",")
    .reverse()
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ") || "Classic Author";

  const title = doc.title || "Untitled Classic";
  const generatedCover = generateBookCoverSvg(title, authorName, gutenbergId || 0);
  const subject = Array.isArray(doc.subject) ? doc.subject[0] : doc.subject || "Classic Literature";

  return {
    id: gutenbergId ? `gutenberg_${gutenbergId}` : `ia_${doc.identifier}`,
    gutenbergId,
    archiveIdentifier: doc.identifier,
    title,
    author: authorName,
    coverUrl: `https://archive.org/services/img/${doc.identifier}`,
    generatedCover,
    synopsis: `${subject}. Downloaded ${
      doc.downloads?.toLocaleString() || "thousands of"
    } times via Project Gutenberg Archive.`,
    textUrl: gutenbergId
      ? `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}-0.txt`
      : null,
    subjects: Array.isArray(doc.subject) ? doc.subject : subject ? [subject] : [],
  };
}

// ─── Curated instant catalog (shows immediately with 0ms loading delay) ─────
function makeCuratedBook(gutenbergId, title, author, synopsis, subject, olCoverId = null) {
  const generatedCover = generateBookCoverSvg(title, author, gutenbergId);
  const olCover = olCoverId ? `https://covers.openlibrary.org/b/id/${olCoverId}-M.jpg` : null;
  return {
    id: `gutenberg_${gutenbergId}`,
    gutenbergId,
    title,
    author,
    coverUrl:
      olCover ||
      getBookCoverProxyUrl({ gutenbergId, title, author }) ||
      `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`,
    generatedCover,
    synopsis,
    textUrl: `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}-0.txt`,
    subjects: [subject],
  };
}

export const FALLBACK_POPULAR = [
  makeCuratedBook(84, "Frankenstein", "Mary Wollstonecraft Shelley", "Gothic Fiction. A scientist creates life and faces terrifying consequences in this landmark horror novel.", "Gothic fiction", 12355749),
  makeCuratedBook(1342, "Pride and Prejudice", "Jane Austen", "Romance. A sharp-witted heroine navigates love, class, and society in Regency England.", "Love stories", 14348537),
  makeCuratedBook(11, "Alice's Adventures in Wonderland", "Lewis Carroll", "Fantasy. A young girl falls through a rabbit hole into a world of impossible adventures.", "Fantasy fiction", 8739200),
  makeCuratedBook(1661, "The Adventures of Sherlock Holmes", "Arthur Conan Doyle", "Detective fiction. Twelve classic cases solved by the world's greatest detective.", "Detective and mystery stories", 6717853),
  makeCuratedBook(2701, "Moby Dick", "Herman Melville", "Adventure. Captain Ahab's obsessive quest across the ocean for a great white whale.", "Whaling -- Fiction", 12621359),
  makeCuratedBook(345, "Dracula", "Bram Stoker", "Gothic Horror. Count Dracula's attempt to move from Transylvania to England in this epistolary classic.", "Vampires -- Fiction", 8231990),
  makeCuratedBook(174, "The Picture of Dorian Gray", "Oscar Wilde", "Philosophical Fiction. A young man stays forever youthful while his hidden portrait ages with every sin.", "Didactic fiction", 14561142),
  makeCuratedBook(98, "A Tale of Two Cities", "Charles Dickens", "Historical Fiction. Love, sacrifice, and upheaval across London and Paris during the French Revolution.", "Historical fiction", 12650261),
  makeCuratedBook(1260, "Jane Eyre", "Charlotte Brontë", "Gothic Romance. An orphaned governess uncovers dark secrets at Thornfield Hall.", "Love stories", 12622706),
  makeCuratedBook(1400, "Great Expectations", "Charles Dickens", "Bildungsroman. Young Pip's journey from humble orphan to London gentleman.", "Bildungsromans", 12554815),
];

export const FALLBACK_SCIFI = [
  makeCuratedBook(36, "The War of the Worlds", "H. G. Wells", "Science Fiction. Martians invade Earth in this groundbreaking science-fiction classic.", "Science fiction", 8228724),
  makeCuratedBook(35, "The Time Machine", "H. G. Wells", "Science Fiction. A Victorian inventor travels far into the future to discover humanity's fate.", "Science fiction", 8228723),
  makeCuratedBook(164, "Twenty Thousand Leagues Under the Sea", "Jules Verne", "Science Fiction. A thrilling underwater adventure aboard Captain Nemo's submarine.", "Science fiction", 8775179),
  makeCuratedBook(103, "Around the World in Eighty Days", "Jules Verne", "Adventure. Phileas Fogg wagers he can circumnavigate the globe in eighty days.", "Voyages and travels", 12693112),
  makeCuratedBook(18857, "A Journey to the Centre of the Earth", "Jules Verne", "Science Fiction. An expedition descends into volcanic tubes toward Earth's core.", "Science fiction", 8235314),
  makeCuratedBook(139, "The Lost World", "Arthur Conan Doyle", "Adventure. Professor Challenger discovers living dinosaurs on a South American plateau.", "Science fiction", 8259516),
  makeCuratedBook(62, "A Princess of Mars", "Edgar Rice Burroughs", "Planetary Romance. John Carter is mysteriously transported to an ancient, warring Mars.", "Science fiction", 8259028),
  makeCuratedBook(5230, "The Invisible Man", "H. G. Wells", "Science Fiction. A scientist unlocks optical invisibility and slowly unravels into madness.", "Science fiction", 8228720),
];

export const FALLBACK_MYSTERY = [
  makeCuratedBook(43, "The Strange Case of Dr. Jekyll and Mr. Hyde", "Robert Louis Stevenson", "Gothic Mystery. A respected London doctor creates a potion that unleashes his darker self.", "Horror tales", 12645873),
  makeCuratedBook(2852, "The Hound of the Baskervilles", "Arthur Conan Doyle", "Detective Mystery. Sherlock Holmes investigates an ancient family curse on the misty moors.", "Detective and mystery stories", 12536004),
  makeCuratedBook(244, "A Study in Scarlet", "Arthur Conan Doyle", "Detective Fiction. The very first appearance of Sherlock Holmes and Dr. John Watson.", "Detective and mystery stories", 8231854),
  makeCuratedBook(583, "The Woman in White", "Wilkie Collins", "Mystery Thriller. An eerie encounter on a moonlit London road leads to a web of identity and inheritance.", "Mystery fiction", 8241186),
  makeCuratedBook(209, "The Turn of the Screw", "Henry James", "Ghost Story. A young governess fears supernatural forces are haunting two children at Bly Manor.", "Ghost stories", 8231995),
  makeCuratedBook(1184, "The Count of Monte Cristo", "Alexandre Dumas", "Adventure & Revenge. Wrongfully imprisoned Edmond Dantès escapes to orchestrate an intricate reckoning.", "Adventure stories", 12630789),
];

export const FALLBACK_PHILOSOPHY = [
  makeCuratedBook(2680, "Meditations", "Marcus Aurelius", "Stoic Philosophy. Private reflections on duty, resilience, and serenity by Rome's philosopher-emperor.", "Stoics", 12553205),
  makeCuratedBook(1232, "The Prince", "Niccolò Machiavelli", "Political Philosophy. The definitive Renaissance treatise on statecraft and political power.", "Political science", 8231172),
  makeCuratedBook(132, "The Art of War", "Sun Tzu", "Strategy. Ancient Chinese wisdom on leadership, planning, and conflict resolution.", "Military art and science", 12622726),
  makeCuratedBook(1497, "The Republic", "Plato", "Classical Philosophy. Socrates explores justice, ethics, and the ideal society.", "Political science", 12649807),
  makeCuratedBook(4363, "Beyond Good and Evil", "Friedrich Nietzsche", "Philosophy. A bold critique of traditional morality and the nature of truth.", "Philosophy", 8231215),
  makeCuratedBook(205, "Walden", "Henry David Thoreau", "Transcendentalism. Two years of simple living and self-reliance beside Walden Pond.", "Solitude", 8231921),
];

export function getInitialCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.popular?.length >= 10) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return {
    popular: FALLBACK_POPULAR,
    scifi: FALLBACK_SCIFI,
    mystery: FALLBACK_MYSTERY,
    philosophy: FALLBACK_PHILOSOPHY,
  };
}

export function saveCatalogCache(catalog) {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // ignore quota errors
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// 1. Fetch public-domain books (fast 5s Gutendex + fast Archive.org fallback)
export async function fetchCatalogBooks(topic = "", page = 1) {
  const params = new URLSearchParams({ page: String(page) });
  if (topic) params.set("topic", topic);

  try {
    const res = await fetchWithTimeout(`${GUTENDEX_BASE}?${params.toString()}`, 5000);
    if (res.ok) {
      const data = await res.json();
      if (data.results?.length > 0) {
        return data.results.map(normalizeGutendexBook);
      }
    }
  } catch {
    // Gutendex timed out or unavailable — fall back cleanly to Archive.org
  }

  // Fast Archive.org Gutenberg collection fallback (~1s response, CORS-enabled)
  const topicFilter = topic ? ` AND subject:("${topic}")` : "";
  const iaQuery = `collection:gutenberg AND mediatype:texts AND language:eng${topicFilter}`;
  const iaUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
    iaQuery
  )}&fl[]=identifier,title,creator,downloads,subject,call_number&sort[]=downloads+desc&rows=20&page=${page}&output=json`;

  const iaRes = await fetchWithTimeout(iaUrl, 7000);
  if (!iaRes.ok) throw new Error("Failed to fetch catalog books");
  const iaData = await iaRes.json();
  return (iaData.response?.docs || []).map(normalizeArchiveBook);
}

// 2. Search books across Gutendex, Internet Archive Gutenberg, and Open Library
export async function searchBooks(query) {
  if (!query?.trim()) return [];
  const q = query.trim();

  try {
    const res = await fetchWithTimeout(
      `${GUTENDEX_BASE}?search=${encodeURIComponent(q)}`,
      5000
    );
    if (res.ok) {
      const data = await res.json();
      if (data.results?.length > 0) {
        return data.results.slice(0, 20).map(normalizeGutendexBook);
      }
    }
  } catch {
    // Gutendex timed out — try Archive.org Gutenberg search next
  }

  try {
    const iaQuery = `collection:gutenberg AND mediatype:texts AND (${q})`;
    const iaUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      iaQuery
    )}&fl[]=identifier,title,creator,downloads,subject,call_number&sort[]=downloads+desc&rows=18&output=json`;
    const iaRes = await fetchWithTimeout(iaUrl, 6000);
    if (iaRes.ok) {
      const iaData = await iaRes.json();
      const docs = iaData.response?.docs || [];
      if (docs.length > 0) {
        return docs.map(normalizeArchiveBook);
      }
    }
  } catch {
    // fall through to Open Library
  }

  try {
    const olRes = await fetchWithTimeout(
      `${OPEN_LIBRARY_SEARCH}?q=${encodeURIComponent(q)}&limit=15&fields=key,title,author_name,cover_i,first_sentence`,
      6000
    );
    const olData = await olRes.json();
    return (olData.docs || []).map((doc) => ({
      id: `ol_${doc.key?.replace("/works/", "") || Math.random()}`,
      title: doc.title,
      author: doc.author_name?.[0] || "Unknown Author",
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : generateBookCoverSvg(doc.title, doc.author_name?.[0] || "", 0),
      generatedCover: generateBookCoverSvg(doc.title, doc.author_name?.[0] || "", 0),
      synopsis: doc.first_sentence?.[0] || "Discovered via Open Library.",
      textUrl: null,
      gutenbergId: null,
    }));
  } catch {
    return [];
  }
}

// 3. Fetch & paginate real full book text
export async function fetchBookPages(book) {
  if (!book?.textUrl && !book?.gutenbergId && !book?.archiveIdentifier) return null;

  const cacheKey = book.id || book.textUrl;
  if (pagesCache.has(cacheKey)) {
    return pagesCache.get(cacheKey);
  }

  let rawText = await fetchGutenbergTextString(
    book.textUrl,
    book.gutenbergId,
    book.title,
    book.archiveIdentifier || null
  );

  // Strip Project Gutenberg header & footer
  const startMarker = rawText.indexOf("*** START OF");
  if (startMarker !== -1) {
    const afterHeader = rawText.indexOf("\n", startMarker);
    if (afterHeader !== -1) rawText = rawText.slice(afterHeader + 1);
  }
  const endMarker = rawText.indexOf("*** END OF");
  if (endMarker !== -1) rawText = rawText.slice(0, endMarker);

  const paragraphs = rawText
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\r?\n/g, " ").trim())
    .filter((p) => p.length > 30);

  const pages = [];
  let currentChunk = [];
  let wordCount = 0;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).length;
    if (wordCount + words > 320 && currentChunk.length > 0) {
      pages.push(currentChunk);
      currentChunk = [para];
      wordCount = words;
    } else {
      currentChunk.push(para);
      wordCount += words;
    }
  }
  if (currentChunk.length > 0) pages.push(currentChunk);

  if (pages.length > 0) {
    pagesCache.set(cacheKey, pages);
    return pages;
  }
  return null;
}
