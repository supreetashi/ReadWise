import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const textCache = new Map();
const repoCache = new Map(); // gutenbergId -> "GITenberg/Repo_id"
const coverCache = new Map(); // cacheKey -> { contentType, buffer } | null

function slugifyTitle(title = '') {
  return title
    .replace(/['’`]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .trim()
    .split(/\s+/)
    .join('-');
}

function getSlugCandidates(title = '') {
  const candidates = new Set();
  if (!title) return [];
  candidates.add(slugifyTitle(title));
  const mainTitle = title.split(/[;:]/)[0].trim();
  if (mainTitle) candidates.add(slugifyTitle(mainTitle));
  return Array.from(candidates).filter(Boolean);
}

async function fetchWithTimeout(url, options = {}, ms = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function isValidBookText(text) {
  if (!text || text.length < 500) return false;
  const head = text.slice(0, 600);
  if (/REDACTED_BY_IA_S3|x-archive-meta|<html[\s>]|<!DOCTYPE html/i.test(head)) {
    return false;
  }
  return true;
}

async function resolveGitenbergRepo(gutenbergId, title) {
  if (!gutenbergId) return null;
  if (repoCache.has(gutenbergId)) return repoCache.get(gutenbergId);

  // 1. Probe direct repo slug guesses via GitHub raw (no API rate limit)
  for (const slug of getSlugCandidates(title)) {
    const repo = `GITenberg/${slug}_${gutenbergId}`;
    for (const file of [`${gutenbergId}-0.txt`, `${gutenbergId}-8.txt`, `${gutenbergId}.txt`]) {
      try {
        const probe = await fetchWithTimeout(
          `https://raw.githubusercontent.com/${repo}/master/${file}`,
          { method: 'HEAD' },
          4000
        );
        if (probe.ok) {
          repoCache.set(gutenbergId, repo);
          return repo;
        }
      } catch {
        // continue
      }
    }
  }

  // 2. Fallback to GitHub repository search API (narrowed by keyword + ID)
  const keywords = title
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const queries = [
    `org:GITenberg _${gutenbergId} in:name`,
    ...(keywords.length > 0
      ? [`org:GITenberg ${keywords[keywords.length - 1]} ${gutenbergId} in:name`]
      : []),
  ];

  for (const q of queries) {
    try {
      const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`;
      const res = await fetchWithTimeout(
        searchUrl,
        { headers: { 'User-Agent': 'ReadWise-Reader/1.0' } },
        6000
      );
      if (res.ok) {
        const data = await res.json();
        const match = data.items?.find((it) => it.name.endsWith(`_${gutenbergId}`));
        if (match) {
          repoCache.set(gutenbergId, match.full_name);
          return match.full_name;
        }
      }
    } catch {
      // ignore
    }
  }

  repoCache.set(gutenbergId, null);
  return null;
}

async function fetchFromGitenberg(gutenbergId, title) {
  if (!gutenbergId) return null;

  // Try direct raw files for likely slugs first
  for (const slug of getSlugCandidates(title)) {
    for (const file of [`${gutenbergId}-0.txt`, `${gutenbergId}-8.txt`, `${gutenbergId}.txt`]) {
      try {
        const r = await fetchWithTimeout(
          `https://raw.githubusercontent.com/GITenberg/${slug}_${gutenbergId}/master/${file}`,
          {},
          8000
        );
        if (r.ok) {
          const text = await r.text();
          if (isValidBookText(text)) return text;
        }
      } catch {
        // try next
      }
    }
  }

  // Resolve exact repo via GitHub API and inspect contents
  const repo = await resolveGitenbergRepo(gutenbergId, title);
  if (!repo) return null;

  try {
    const contentsRes = await fetchWithTimeout(
      `https://api.github.com/repos/${repo}/contents`,
      { headers: { 'User-Agent': 'ReadWise-Reader/1.0' } },
      6000
    );
    if (!contentsRes.ok) return null;
    const files = await contentsRes.json();
    if (!Array.isArray(files)) return null;

    const preferred = [
      `${gutenbergId}-0.txt`,
      `${gutenbergId}-8.txt`,
      `${gutenbergId}.txt`,
    ];
    const targetFile =
      files.find((f) => preferred.includes(f.name)) ||
      files.find((f) => f.name.endsWith('.txt') && !/readme|license/i.test(f.name));

    if (targetFile?.download_url) {
      const txtRes = await fetchWithTimeout(targetFile.download_url, {}, 10000);
      if (txtRes.ok) {
        const text = await txtRes.text();
        if (isValidBookText(text)) return text;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function pickBestArchiveTxtFile(files = [], gutenbergId = '') {
  const validTxt = files.filter((f) => {
    const name = f?.name || '';
    if (!name.toLowerCase().endsWith('.txt')) return false;
    // Exclude Internet Archive S3/metadata/readme files
    if (/_meta\.txt$|_files\.txt$|_s3.*\.txt$|readme/i.test(name)) return false;
    if (f.size && Number(f.size) < 2000) return false;
    return true;
  });

  if (validTxt.length === 0) return null;

  if (gutenbergId) {
    const preferredNames = [
      `${gutenbergId}-0.txt`,
      `${gutenbergId}-8.txt`,
      `${gutenbergId}.txt`,
      `pg${gutenbergId}.txt`,
    ];
    for (const pName of preferredNames) {
      const match = validTxt.find((f) => f.name.toLowerCase() === pName.toLowerCase());
      if (match) return match;
    }
  }

  const djvu = validTxt.find((f) => f.name.endsWith('_djvu.txt'));
  if (djvu) return djvu;

  return validTxt.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0];
}

async function fetchFromInternetArchive(gutenbergId, title) {
  const queries = [];
  if (gutenbergId) {
    queries.push(`collection:gutenberg AND "gutenberg etext# ${gutenbergId}"`);
  }
  if (title) {
    const cleanTitle = title.split(/[;:]/)[0].replace(/["']/g, '').trim();
    if (cleanTitle) {
      queries.push(`title:("${cleanTitle}") AND collection:gutenberg`);
      queries.push(`title:("${cleanTitle}") AND mediatype:texts AND format:Text`);
    }
  }

  for (const query of queries) {
    try {
      const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
        query
      )}&fl[]=identifier&sort[]=downloads+desc&rows=3&output=json`;

      const res = await fetchWithTimeout(searchUrl, {}, 6000);
      if (!res.ok) continue;
      const data = await res.json();
      const docs = data.response?.docs || [];

      for (const doc of docs) {
        const metaRes = await fetchWithTimeout(
          `https://archive.org/metadata/${doc.identifier}/files`,
          {},
          5000
        );
        if (!metaRes.ok) continue;
        const meta = await metaRes.json();
        const txtFile = pickBestArchiveTxtFile(meta.result, gutenbergId);
        if (!txtFile) continue;

        const txtRes = await fetchWithTimeout(
          `https://archive.org/download/${doc.identifier}/${encodeURIComponent(txtFile.name)}`,
          {},
          10000
        );
        if (txtRes.ok) {
          const text = await txtRes.text();
          if (isValidBookText(text)) return text;
        }
      }
    } catch {
      // try next query
    }
  }
  return null;
}

/**
 * Vite dev-server middleware that fetches Project Gutenberg book text and covers
 * server-side with automatic fallback to GITenberg (GitHub), Internet Archive,
 * and Open Library when www.gutenberg.org is unavailable or returns 503.
 */
function gutenbergMediaProxy() {
  return {
    name: 'gutenberg-media-proxy',
    configureServer(server) {
      server.middlewares.use('/api/book-text', async (req, res) => {
        try {
          const parsed = new URL(req.url, 'http://localhost');
          const targetUrl = parsed.searchParams.get('url') || '';
          const gutenbergId = parsed.searchParams.get('id') || '';
          const title = parsed.searchParams.get('title') || '';

          const cacheKey = gutenbergId || targetUrl || title;
          if (!cacheKey) {
            res.statusCode = 400;
            res.end('Missing book identifier');
            return;
          }

          if (textCache.has(cacheKey)) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(textCache.get(cacheKey));
            return;
          }

          // 1. Try direct Gutenberg URLs (if www.gutenberg.org is online)
          const gutenbergCandidates = [];
          if (/^https?:\/\/(www\.)?gutenberg\.org\//i.test(targetUrl)) {
            gutenbergCandidates.push(targetUrl);
          }
          if (gutenbergId) {
            const cacheTxt = `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`;
            if (!gutenbergCandidates.includes(cacheTxt)) {
              gutenbergCandidates.push(cacheTxt);
            }
          }

          for (const gUrl of gutenbergCandidates) {
            try {
              const upstream = await fetchWithTimeout(
                gUrl,
                {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                  },
                },
                4500
              );
              const contentType = upstream.headers.get('content-type') || '';
              if (upstream.ok && !contentType.includes('text/html')) {
                const text = await upstream.text();
                if (isValidBookText(text)) {
                  textCache.set(cacheKey, text);
                  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                  res.end(text);
                  return;
                }
              }
            } catch {
              // Gutenberg unavailable, fall through to mirrors
            }
          }

          // 2. Try GITenberg GitHub mirror
          const ghText = await fetchFromGitenberg(gutenbergId, title);
          if (ghText) {
            textCache.set(cacheKey, ghText);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(ghText);
            return;
          }

          // 3. Try Internet Archive Gutenberg collection & text archive
          const iaText = await fetchFromInternetArchive(gutenbergId, title);
          if (iaText) {
            textCache.set(cacheKey, iaText);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(iaText);
            return;
          }

          res.statusCode = 502;
          res.end('Unable to load book text from Gutenberg or mirrors');
        } catch (err) {
          res.statusCode = 502;
          res.end(`Proxy fetch failed: ${err.message}`);
        }
      });

      server.middlewares.use('/api/book-cover', async (req, res) => {
        try {
          const parsed = new URL(req.url, 'http://localhost');
          const gutenbergId = parsed.searchParams.get('id') || '';
          const title = parsed.searchParams.get('title') || '';
          const author = parsed.searchParams.get('author') || '';
          const cacheKey = `${gutenbergId}_${title}`;

          if (coverCache.has(cacheKey)) {
            const cached = coverCache.get(cacheKey);
            if (!cached) {
              res.statusCode = 404;
              res.end('Cover not found');
              return;
            }
            res.setHeader('Content-Type', cached.contentType);
            res.end(cached.buffer);
            return;
          }

          // 1. Try GITenberg cover.jpg / cover.png for known/slugged repo
          if (gutenbergId) {
            const candidates = [];
            if (repoCache.get(gutenbergId)) {
              candidates.push(repoCache.get(gutenbergId));
            }
            for (const slug of getSlugCandidates(title)) {
              candidates.push(`GITenberg/${slug}_${gutenbergId}`);
            }
            for (const repo of candidates) {
              for (const file of ['cover.jpg', 'cover.png']) {
                try {
                  const r = await fetchWithTimeout(
                    `https://raw.githubusercontent.com/${repo}/master/${file}`,
                    {},
                    4000
                  );
                  if (r.ok) {
                    const buffer = Buffer.from(await r.arrayBuffer());
                    const contentType = r.headers.get('content-type') || 'image/jpeg';
                    coverCache.set(cacheKey, { contentType, buffer });
                    res.setHeader('Content-Type', contentType);
                    res.end(buffer);
                    return;
                  }
                } catch {
                  // try next
                }
              }
            }
          }

          // 2. Fallback to Open Library cover by title & author
          if (title) {
            const cleanTitle = title.split(/[;:]/)[0].trim();
            const olUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(
              cleanTitle
            )}${author ? `&author=${encodeURIComponent(author)}` : ''}&limit=1&fields=cover_i`;
            const olRes = await fetchWithTimeout(olUrl, {}, 5000);
            if (olRes.ok) {
              const olData = await olRes.json();
              const coverId = olData.docs?.[0]?.cover_i;
              if (coverId) {
                const imgRes = await fetchWithTimeout(
                  `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
                  {},
                  5000
                );
                if (imgRes.ok) {
                  const buffer = Buffer.from(await imgRes.arrayBuffer());
                  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
                  coverCache.set(cacheKey, { contentType, buffer });
                  res.setHeader('Content-Type', contentType);
                  res.end(buffer);
                  return;
                }
              }
            }
          }

          coverCache.set(cacheKey, null);
          res.statusCode = 404;
          res.end('Cover not found');
        } catch {
          res.statusCode = 404;
          res.end('Cover lookup failed');
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    gutenbergMediaProxy(),
  ],
  worker: {
    format: 'es',
  },
})
