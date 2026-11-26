import { useEffect, useState } from "react";
import HeroBanner from "../components/catalog/HeroBanner";
import BookShelf from "../components/catalog/BookShelf";
import { getAllSavedPdfs } from "../utils/pdfStorage";
import { getSavedProgressMap } from "../hooks/useReadingProgress";
import {
  fetchCatalogBooks,
  searchBooks,
  getInitialCatalog,
  saveCatalogCache,
} from "../utils/bookApi";

function mergeBooks(base = [], incoming = []) {
  const map = new Map();
  for (const b of base) map.set(b.id, b);
  for (const b of incoming) {
    if (!map.has(b.id)) map.set(b.id, b);
  }
  return Array.from(map.values());
}

export default function HomePage({ onSelectBook, searchQuery = "" }) {
  const [initialCatalog] = useState(() => getInitialCatalog());
  const [uploadedBooks, setUploadedBooks] = useState([]);
  const [popularBooks, setPopularBooks] = useState(initialCatalog.popular);
  const [scifiBooks, setScifiBooks] = useState(initialCatalog.scifi);
  const [mysteryBooks, setMysteryBooks] = useState(initialCatalog.mystery);
  const [philosophyBooks, setPhilosophyBooks] = useState(initialCatalog.philosophy);

  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progressMap] = useState(() => getSavedProgressMap());

  // Load saved IndexedDB PDFs and refresh live catalog silently in background
  useEffect(() => {
    let cancelled = false;

    getAllSavedPdfs()
      .then((saved) => {
        if (!cancelled) setUploadedBooks(saved);
      })
      .catch((err) => console.error("IndexedDB load error:", err));

    Promise.allSettled([
      fetchCatalogBooks("", 1),
      fetchCatalogBooks("science fiction", 1),
      fetchCatalogBooks("mystery", 1),
      fetchCatalogBooks("philosophy", 1),
    ]).then(([popRes, scifiRes, mysRes, philRes]) => {
      if (cancelled) return;

      const nextCatalog = {
        popular:
          popRes.status === "fulfilled" && popRes.value.length > 0
            ? mergeBooks(initialCatalog.popular, popRes.value)
            : initialCatalog.popular,
        scifi:
          scifiRes.status === "fulfilled" && scifiRes.value.length > 0
            ? mergeBooks(initialCatalog.scifi, scifiRes.value)
            : initialCatalog.scifi,
        mystery:
          mysRes.status === "fulfilled" && mysRes.value.length > 0
            ? mergeBooks(initialCatalog.mystery, mysRes.value)
            : initialCatalog.mystery,
        philosophy:
          philRes.status === "fulfilled" && philRes.value.length > 0
            ? mergeBooks(initialCatalog.philosophy, philRes.value)
            : initialCatalog.philosophy,
      };

      setPopularBooks(nextCatalog.popular);
      setScifiBooks(nextCatalog.scifi);
      setMysteryBooks(nextCatalog.mystery);
      setPhilosophyBooks(nextCatalog.philosophy);
      saveCatalogCache(nextCatalog);
    });

    return () => {
      cancelled = true;
    };
  }, [initialCatalog]);

  // Debounced live search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchBooks(q)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((err) => console.error("Search API error:", err))
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const attachProgress = (book) => {
    const saved = progressMap[book.id];
    return saved
      ? { ...book, progress: saved.percentage || book.progress || 5 }
      : book;
  };

  const allBooks = [
    ...uploadedBooks,
    ...popularBooks,
    ...scifiBooks,
    ...mysteryBooks,
    ...philosophyBooks,
  ].map(attachProgress);

  const uniqueBooks = Array.from(
    new Map(allBooks.map((b) => [b.id, b])).values()
  );
  const continueReadingBooks = uniqueBooks.filter((b) => progressMap[b.id]);

  // Search view when user types in Navbar
  if (searchQuery.trim()) {
    return (
      <div className="pt-28 pb-16 min-h-screen">
        {isSearching ? (
          <div className="text-center text-white/60 py-20 animate-pulse">
            Searching library for "{searchQuery}"...
          </div>
        ) : searchResults.length > 0 ? (
          <BookShelf
            title={`Search Results for "${searchQuery}"`}
            books={searchResults.map(attachProgress)}
            onSelectBook={onSelectBook}
          />
        ) : (
          <div className="text-center text-white/50 py-20">
            No books found matching "{searchQuery}".
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sm:pb-8">
      {popularBooks.length > 0 && (
        <HeroBanner
          featuredBooks={popularBooks.slice(0, 5)}
          onStartReading={onSelectBook}
        />
      )}

      <div id="library">
        {uploadedBooks.length > 0 && (
          <BookShelf
            title="My Uploaded PDFs"
            books={uploadedBooks.map(attachProgress)}
            onSelectBook={onSelectBook}
          />
        )}

        {continueReadingBooks.length > 0 && (
          <BookShelf
            title="Continue Reading"
            books={continueReadingBooks}
            onSelectBook={onSelectBook}
          />
        )}
      </div>

      <div id="trending">
        {popularBooks.length > 0 && (
          <BookShelf
            title="Trending Classics"
            books={popularBooks.map(attachProgress)}
            onSelectBook={onSelectBook}
          />
        )}
      </div>

      <div id="genres">
        {scifiBooks.length > 0 && (
          <BookShelf
            title="Science Fiction & Adventure"
            books={scifiBooks.map(attachProgress)}
            onSelectBook={onSelectBook}
          />
        )}

        {mysteryBooks.length > 0 && (
          <BookShelf
            title="Mystery, Gothic & Thrillers"
            books={mysteryBooks.map(attachProgress)}
            onSelectBook={onSelectBook}
          />
        )}

        {philosophyBooks.length > 0 && (
          <BookShelf
            title="Philosophy & Timeless Wisdom"
            books={philosophyBooks.map(attachProgress)}
            onSelectBook={onSelectBook}
          />
        )}
      </div>
    </div>
  );
}
