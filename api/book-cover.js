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

async function fetchWithTimeout(url, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  const parsed = new URL(req.url, "http://localhost");
  const gutenbergId = parsed.searchParams.get("id") || "";
  const title = parsed.searchParams.get("title") || "";
  const author = parsed.searchParams.get("author") || "";

  if (gutenbergId) {
    for (const slug of getSlugCandidates(title)) {
      for (const file of ["cover.jpg", "cover.png"]) {
        try {
          const r = await fetchWithTimeout(
            `https://raw.githubusercontent.com/GITenberg/${slug}_${gutenbergId}/master/${file}`,
            3500
          );
          if (r.ok) {
            const buffer = Buffer.from(await r.arrayBuffer());
            res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
            res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
            return res.status(200).send(buffer);
          }
        } catch {
          // continue
        }
      }
    }
  }

  if (title) {
    const cleanTitle = title.split(/[;:]/)[0].trim();
    const olUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}${
      author ? `&author=${encodeURIComponent(author)}` : ""
    }&limit=1&fields=cover_i`;
    try {
      const olRes = await fetchWithTimeout(olUrl, 4500);
      if (olRes.ok) {
        const olData = await olRes.json();
        const coverId = olData.docs?.[0]?.cover_i;
        if (coverId) {
          const imgRes = await fetchWithTimeout(
            `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
            4500
          );
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            res.setHeader("Content-Type", imgRes.headers.get("content-type") || "image/jpeg");
            res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
            return res.status(200).send(buffer);
          }
        }
      }
    } catch {
      // fall through
    }
  }

  return res.status(404).send("Cover not found");
}
