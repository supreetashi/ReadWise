import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faMagnifyingGlass,
  faHouse,
  faBookOpen,
  faDownload,
  faBell,
  faCloudArrowUp,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import { saveUploadedPdf } from "../../utils/pdfStorage";
import { extractPagesFromFile } from "../../utils/pdfTextExtractor";
import { generateBookCoverSvg } from "../../utils/bookApi";

export default function Navbar({ onUploadSuccess, searchQuery = "", onSearchChange }) {
  const [scrolled, setScrolled] = useState(false);
  const [searchIcon, setSearchIcon] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [uploadPdf, setUploadPdf] = useState(false);

  // File upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const scrollToSection = (id) => {
    onSearchChange?.("");
    setTimeout(() => {
      if (!id) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 30);
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 130);
    };
    const handleRandomClick = () => {
      setSearchIcon(false);
    };
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("click", handleRandomClick);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleRandomClick);
    };
  }, []);

  const handlePdfToggle = () => {
    setUploadPdf((prev) => !prev);
    setSelectedFile(null);
    setBookTitle("");
    setBookAuthor("");
    setUploadError("");
    setExtracting(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setBookTitle(file.name.replace(/\.[^/.]+$/, ""));
      setBookAuthor("Uploaded Document");
      setUploadError("");
    }
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a PDF or TXT file first.");
      return;
    }

    setExtracting(true);
    setUploadError("");

    try {
      const pages = await extractPagesFromFile(selectedFile);
      const title = bookTitle.trim() || selectedFile.name;
      const author = bookAuthor.trim() || "Unknown Author";
      const idNum = Date.now();
      const generatedCover = generateBookCoverSvg(title, author, idNum);

      const bookMeta = {
        id: `doc_${idNum}`,
        title,
        author,
        coverUrl: generatedCover,
        generatedCover,
        synopsis: `Uploaded document · ${pages.length} readable pages extracted.`,
        pages,
        isUploaded: true,
      };

      try {
        await saveUploadedPdf(bookMeta);
      } catch (err) {
        console.error("Failed to save document to IndexedDB:", err);
      }

      onUploadSuccess?.(bookMeta);
      handlePdfToggle();
    } catch (err) {
      setUploadError(err?.message || "Could not extract text from this file.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <>
      <div className="absolute top-0 left-0 w-full h-32 z-40 bg-gradient-to-b from-black/90 to-transparent pointer-events-none" />

      {/* Main Navbar */}
      <nav
        className={`fixed top-0 left-0 z-50 w-full flex items-center justify-between px-4 sm:px-6 md:px-10 lg:px-15 py-4 transition-colors duration-300 ${
          scrolled ? "bg-black" : "bg-transparent"
        }`}
      >
        <div className="flex items-center justify-center gap-10">
          <div
            onClick={() => scrollToSection(null)}
            className="text-2xl sm:text-2xl md:text-3xl lg:text-4xl font-semibold text-readflow-primary font-dancing cursor-pointer"
          >
            ReadWise
          </div>
          <div className="hidden sm:flex items-center gap-5">
            <button
              onClick={() => scrollToSection("library")}
              className="px-4 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30 cursor-pointer"
            >
              My Library
            </button>
            <button
              onClick={() => scrollToSection("genres")}
              className="px-4 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30 cursor-pointer"
            >
              Genre
            </button>
            <button
              onClick={() => scrollToSection("trending")}
              className="px-4 py-2 rounded-xl bg-white/20 text-white hover:bg-white/30 cursor-pointer"
            >
              Classics
            </button>
          </div>
        </div>

        <div
          className="hidden sm:flex items-center gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center">
            <input
              type="text"
              placeholder="Search Book or Author..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className={`ml-2 bg-transparent border-b border-white text-white outline-none transition-all duration-300 ${
                searchIcon || searchQuery ? "w-52 opacity-100" : "w-0 opacity-0"
              }`}
            />
            <button
              className="text-white cursor-pointer"
              onClick={() => setSearchIcon((prev) => !prev)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </button>
          </div>

          <button
            onClick={handlePdfToggle}
            className="px-4 py-2 rounded-xl bg-readflow-primary text-white hover:bg-red-700 cursor-pointer transition shadow-md"
          >
            Upload your file
          </button>

          <div className="w-9 h-9 rounded-full bg-readflow-primary flex justify-center items-center text-white cursor-pointer">
            <FontAwesomeIcon icon={faUser} />
          </div>
        </div>

        {/* Mobile controls */}
        <div className="flex sm:hidden items-center gap-5 text-white">
          <button onClick={handlePdfToggle}>
            <FontAwesomeIcon icon={faDownload} />
          </button>
          <FontAwesomeIcon icon={faBell} />
        </div>
      </nav>

      {/* Mobile Search Bar */}
      {mobileSearchOpen && (
        <div className="fixed top-16 left-4 right-4 z-50 sm:hidden bg-[#15151A]/95 backdrop-blur-md border border-white/15 rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-xl">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-white/50 text-sm" />
          <input
            type="text"
            autoFocus
            placeholder="Search books or authors..."
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange?.("")}
              className="text-xs text-white/60 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Mobile Bottom Navbar */}
      <nav className="fixed bottom-4 left-4 right-4 z-50 sm:hidden bg-[#242326]/95 backdrop-blur-md rounded-full px-5 py-3 border border-white/10 flex items-center justify-around">
        <button
          onClick={() => {
            setMobileSearchOpen(false);
            scrollToSection(null);
          }}
          className="flex flex-col items-center text-white gap-1"
        >
          <FontAwesomeIcon icon={faHouse} className="text-xl" />
          <span className="text-xs">Home</span>
        </button>
        <button
          onClick={() => {
            setMobileSearchOpen(false);
            scrollToSection("library");
          }}
          className="flex flex-col items-center text-white/60 gap-1"
        >
          <FontAwesomeIcon icon={faBookOpen} className="text-xl" />
          <span className="text-xs">Library</span>
        </button>
        <button
          onClick={() => setMobileSearchOpen((prev) => !prev)}
          className="flex flex-col items-center text-white/60 gap-1"
        >
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xl" />
          <span className="text-xs">Search</span>
        </button>
        <button
          onClick={handlePdfToggle}
          className="flex flex-col items-center text-white/60 gap-1"
        >
          <FontAwesomeIcon icon={faUser} className="text-xl" />
          <span className="text-xs">Upload</span>
        </button>
      </nav>

      {/* Upload PDF Modal */}
      {uploadPdf && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handlePdfToggle}
        >
          <div
            className="bg-[#15151A] w-full max-w-md p-6 rounded-2xl text-white border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4">Upload your PDF or TXT</h2>

            <label className="h-44 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-readflow-gold transition bg-white/[0.02]">
              <FontAwesomeIcon
                icon={faCloudArrowUp}
                className="text-3xl text-readflow-gold/70 mb-2"
              />
              <p className="text-white/80 font-medium text-sm">
                {selectedFile ? selectedFile.name : "Click to select a PDF or TXT file"}
              </p>
              <p className="text-xs text-white/40 mt-1">
                {selectedFile ? "Text will be extracted for speed reading" : "Maximum file size 50MB"}
              </p>
              <input
                type="file"
                accept="application/pdf,.pdf,text/plain,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {uploadError && (
              <p className="mt-3 text-xs text-red-400">{uploadError}</p>
            )}

            <input
              type="text"
              placeholder="Book Title"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              className="w-full mt-4 px-4 py-2.5 rounded-lg bg-white/5 border border-white/15 outline-none focus:border-readflow-gold transition text-sm"
            />

            <input
              type="text"
              placeholder="Author"
              value={bookAuthor}
              onChange={(e) => setBookAuthor(e.target.value)}
              className="w-full mt-3 px-4 py-2.5 rounded-lg bg-white/5 border border-white/15 outline-none focus:border-readflow-gold transition text-sm"
            />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handlePdfToggle}
                disabled={extracting}
                className="flex-1 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm transition cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUpload}
                disabled={!selectedFile || extracting}
                className="flex-1 py-2.5 rounded-lg bg-readflow-primary hover:bg-red-700 disabled:opacity-40 text-sm font-semibold transition cursor-pointer"
              >
                {extracting ? "Extracting text…" : "Open in Reader"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}