import React, { useEffect, useState } from "react";
import HeroBanner from "../components/catalog/HeroBanner";
import BookShelf from "../components/catalog/BookShelf";
import { getAllSavedPdfs } from "../utils/pdfStorage";
import { getSavedProgressMap } from "../hooks/useReadingProgress";
import { fetchCatalogBooks, searchBooks, FALLBACK_POPULAR, FALLBACK_SCIFI } from "../utils/bookApi";

export default function HomePage({ onSelectBook, searchQuery = "" }) {
  const [uploadedBooks, setUploadedBooks] = useState([]);
  const [popularBooks, setPopularBooks] = useState([]);
  const [scifiBooks, setScifiBooks] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [progressMap, setProgressMap] = useState({});
  const [apiError, setApiError] = useState(false);

  // Load local IndexedDB PDFs, progress map, and live API shelves
  useEffect(() => {
    setProgressMap(getSavedProgressMap());

    getAllSavedPdfs()
      .then((saved) => setUploadedBooks(saved))
      .catch((err) => console.error("IndexedDB load error:", err));

    Promise.all([fetchCatalogBooks("", 1), fetchCatalogBooks("science fiction", 1)])
      .then(([popular, scifi]) => {
        setPopularBooks(popular);
        setScifiBooks(scifi);
      })
      .catch((err) => {
        console.warn("Gutendex API unavailable, using fallback books:", err.message);
        setPopularBooks(FALLBACK_POPULAR);
        setScifiBooks(FALLBACK_SCIFI);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      searchBooks(searchQuery)
        .then((results) => setSearchResults(results))
        .catch((err) => console.error("Search API error:", err))
        .finally(() => setIsSearching(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const attachProgress = (book) => {
    const saved = progressMap[book.id];
    return saved
      ? { ...book, progress: saved.percentage || book.progress || 5 }
      : book;
  };

  const allBooks = [...uploadedBooks, ...popularBooks, ...scifiBooks].map(
    attachProgress
  );

  // Deduplicate by id for Continue Reading shelf
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
      {isLoading ? (
        <div className="h-[70vh] flex items-center justify-center text-white/60 animate-pulse">
          Loading ReadWise Catalog...
        </div>
      ) : (
        <>
          {popularBooks.length > 0 && (
            <HeroBanner
              featuredBooks={popularBooks.slice(0, 5)}
              onStartReading={onSelectBook}
            />
          )}

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

          {popularBooks.length > 0 && (
            <BookShelf
              title="Trending Classics"
              books={popularBooks.map(attachProgress)}
              onSelectBook={onSelectBook}
            />
          )}

          {scifiBooks.length > 0 && (
            <BookShelf
              title="Science Fiction & Adventure"
              books={scifiBooks.map(attachProgress)}
              onSelectBook={onSelectBook}
            />
          )}
        </>
      )}
    </div>
  );
}