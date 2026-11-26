import React, { useState } from "react";
import Navbar from "./components/layout/Navbar";
import HomePage from "./pages/HomePage";
import ReaderPage from "./pages/ReaderPage";
import Footer from "./components/layout/Footer";

export default function App() {
  const [currentBook, setCurrentBook] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="min-h-screen bg-[#0B0B0E] text-white">
      {currentBook ? (
        <ReaderPage
          book={currentBook}
          onBack={() => setCurrentBook(null)}
        />
      ) : (
        <>
          <Navbar
            onUploadSuccess={(uploadedBook) => setCurrentBook(uploadedBook)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
          <HomePage
            searchQuery={searchQuery}
            onSelectBook={(book) => setCurrentBook(book)}
          />
          <Footer />
        </>
      )}
    </div>
  );
}