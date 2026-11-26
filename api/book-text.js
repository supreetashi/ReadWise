const textCache = new Map();
const repoCache = new Map();

function slugifyTitle(title = "") {
  return title
    .replace(/['’`]/g, "")
    .replace(/[^a-zA-Z0-9\s\-]/g, " ")
    .trim()
    .split(/\s+/)
    .join("-");
}

function getSlugCandidates(title = "") {
  const candidates = new Set();
  if (!title) return [];
  candidates.add(slugifyTitle(title));
  const mainTitle = title.split(/[;:]/)[0].trim();
  if (mainTitle) candidates.add(slugifyTitle(mainTitle));
  return Array.from(candidates).filter(Boolean);
}

async function fetchWithTimeout(url, options = {}, ms = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { redirect: "follow", ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isValidBookText(text) {
  if (!text || text.length < 500) return false;
  const head = text.slice(0, 600);
  return !/REDACTED_BY_IA_S3|x-archive-meta|<html[\s>]|<!DOCTYPE html/i.test(head);
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
    for (const pName of [
      `${gutenbergId}-0.txt`,
      `${gutenbergId}-8.txt`,
      `${gutenbergId}.txt`,
      `pg${gutenbergId}.txt`,
    ]) {
      const m = validTxt.find((f) => f.name.toLowerCase() === pName.toLowerCase());
      if (m) return m;
    }
  }
  return (
    validTxt.find((f) => f.name.endsWith("_djvu.txt")) ||
    validTxt.sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0]
  );
}

async function resolveGitenbergRepo(gutenbergId, title) {
  if (!gutenbergId) return null;
  if (repoCache.has(gutenbergId)) return repoCache.get(gutenbergId);

  for (const slug of getSlugCandidates(title)) {
    const repo = `GITenberg/${slug}_${gutenbergId}`;
    for (const file of [`${gutenbergId}-0.txt`, `${gutenbergId}-8.txt`, `${gutenbergId}.txt`]) {
      try {
        const probe = await fetchWithTimeout(
          `https://raw.githubusercontent.com/${repo}/master/${file}`,
          { method: "HEAD" },
          3500
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

  const keywords = title.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const queries = [
    `org:GITenberg _${gutenbergId} in:name`,
    ...(keywords.length > 0 ? [`org:GITenberg ${keywords[keywords.length - 1]} ${gutenbergId} in:name`] : []),
  ];

  for (const q of queries) {
    try {
      const res = await fetchWithTimeout(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`,
        { headers: { "User-Agent": "ReadWise-Reader/1.0" } },
        5000
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
      // continue
    }
  }
  repoCache.set(gutenbergId, null);
  return null;
}

export default async function handler(req, res) {
  const parsed = new URL(req.url, "http://localhost");
  const targetUrl = parsed.searchParams.get("url") || "";
  const gutenbergId = parsed.searchParams.get("id") || "";
  const title = parsed.searchParams.get("title") || "";

  const cacheKey = gutenbergId || targetUrl || title;
  if (!cacheKey) {
    return res.status(400).send("Missing book identifier");
  }

  if (textCache.has(cacheKey)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).send(textCache.get(cacheKey));
  }

  // 1. Direct Gutenberg
  const gCandidates = [];
  if (/^https?:\/\/(www\.)?gutenberg\.org\//i.test(targetUrl)) gCandidates.push(targetUrl);
  if (gutenbergId) {
    const cacheTxt = `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`;
    if (!gCandidates.includes(cacheTxt)) gCandidates.push(cacheTxt);
  }
  for (const gUrl of gCandidates) {
    try {
      const upstream = await fetchWithTimeout(gUrl, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0" },
      }, 4000);
      const ct = upstream.headers.get("content-type") || "";
      if (upstream.ok && !ct.includes("text/html")) {
        const text = await upstream.text();
        if (isValidBookText(text)) {
          textCache.set(cacheKey, text);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
          return res.status(200).send(text);
        }
      }
    } catch {
      // fall through
    }
  }

  // 2. GITenberg
  if (gutenbergId) {
    for (const slug of getSlugCandidates(title)) {
      for (const file of [`${gutenbergId}-0.txt`, `${gutenbergId}-8.txt`, `${gutenbergId}.txt`]) {
        try {
          const r = await fetchWithTimeout(
            `https://raw.githubusercontent.com/GITenberg/${slug}_${gutenbergId}/master/${file}`,
            {},
            6500
          );
          if (r.ok) {
            const text = await r.text();
            if (isValidBookText(text)) {
              textCache.set(cacheKey, text);
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
              return res.status(200).send(text);
            }
          }
        } catch {
          // continue
        }
      }
    }

    const repo = await resolveGitenbergRepo(gutenbergId, title);
    if (repo) {
      try {
        const cRes = await fetchWithTimeout(
          `https://api.github.com/repos/${repo}/contents`,
          { headers: { "User-Agent": "ReadWise-Reader/1.0" } },
          5000
        );
        if (cRes.ok) {
          const files = await cRes.json();
          const preferred = [`${gutenbergId}-0.txt`, `${gutenbergId}-8.txt`, `${gutenbergId}.txt`];
          const target = Array.isArray(files)
            ? files.find((f) => preferred.includes(f.name)) ||
              files.find((f) => f.name.endsWith(".txt") && !/readme|license/i.test(f.name))
            : null;
          if (target?.download_url) {
            const txtRes = await fetchWithTimeout(target.download_url, {}, 8000);
            if (txtRes.ok) {
              const text = await txtRes.text();
              if (isValidBookText(text)) {
                textCache.set(cacheKey, text);
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
                return res.status(200).send(text);
              }
            }
          }
        }
      } catch {
        // fall through
      }
    }
  }

  // 3. Internet Archive
  const queries = [];
  if (gutenbergId) queries.push(`collection:gutenberg AND "gutenberg etext# ${gutenbergId}"`);
  if (title) {
    const cleanTitle = title.split(/[;:]/)[0].replace(/["']/g, "").trim();
    if (cleanTitle) {
      queries.push(`title:("${cleanTitle}") AND collection:gutenberg`);
      queries.push(`title:("${cleanTitle}") AND mediatype:texts AND format:Text`);
    }
  }
  for (const q of queries) {
    try {
      const sRes = await fetchWithTimeout(
        `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&sort[]=downloads+desc&rows=3&output=json`,
        {},
        5500
      );
      if (!sRes.ok) continue;
      const sData = await sRes.json();
      for (const doc of sData.response?.docs || []) {
        const mRes = await fetchWithTimeout(`https://archive.org/metadata/${doc.identifier}/files`, {}, 4500);
        if (!mRes.ok) continue;
        const meta = await mRes.json();
        const txtFile = pickBestArchiveTxtFile(meta.result, gutenbergId);
        if (!txtFile) continue;
        const tRes = await fetchWithTimeout(
          `https://archive.org/download/${doc.identifier}/${encodeURIComponent(txtFile.name)}`,
          {},
          9000
        );
        if (tRes.ok) {
          const text = await tRes.text();
          if (isValidBookText(text)) {
            textCache.set(cacheKey, text);
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
            return res.status(200).send(text);
          }
        }
      }
    } catch {
      // continue
    }
  }

  return res.status(502).send("Unable to load book text from Gutenberg or mirrors");
}
