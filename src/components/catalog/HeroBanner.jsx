import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { getBookCoverProxyUrl, resolveOpenLibraryCover } from "../../utils/bookApi";

export default function HeroBanner({ featuredBooks = [], onStartReading }) {
    const [index, setIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [touchStart, setTouchStart] = useState(null);

    useEffect(() => {
        if (isPaused || featuredBooks.length === 0) return;

        const interval = setInterval(() => {
            setIndex((prev) => (prev + 1) % featuredBooks.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [index, isPaused, featuredBooks.length]);

    if (!featuredBooks || featuredBooks.length === 0) return null;

    function handleLeft() {
        setIndex((index - 1 + featuredBooks.length) % featuredBooks.length);
    }

    function handleRight() {
        setIndex((index + 1) % featuredBooks.length);
    }

    function handleTouchStart(e) {
        setTouchStart(e.touches[0].clientX);
    }

    function handleTouchEnd(e) {
        if (touchStart === null) return;

        const touchEnd = e.changedTouches[0].clientX;
        const distance = touchStart - touchEnd;

        if (Math.abs(distance) > 30) {
            if (distance > 0) {
                handleRight();
            } else {
                handleLeft();
            }
        }

        setTouchStart(null);
    }

    const currentBook = featuredBooks[index];

    async function handleHeroImageError(e) {
        const img = e.currentTarget;
        if (!img.dataset.triedProxy) {
            img.dataset.triedProxy = "1";
            const proxyUrl = getBookCoverProxyUrl(currentBook);
            if (proxyUrl && img.src !== new URL(proxyUrl, window.location.origin).href) {
                img.src = proxyUrl;
                return;
            }
        }
        if (!img.dataset.triedOl) {
            img.dataset.triedOl = "1";
            const olCover = await resolveOpenLibraryCover(currentBook);
            if (olCover && img.isConnected) {
                img.src = olCover;
                return;
            }
        }
        img.onerror = null;
        if (currentBook.generatedCover) {
            img.src = currentBook.generatedCover;
        }
    }

    return (
        <>
            <section className="hidden sm:block relative h-screen overflow-hidden w-full mb-5">
                {/* Background image */}
                <img
                    key={`bg-${currentBook.id}`}
                    src={currentBook.coverUrl}
                    alt={currentBook.title}
                    className="absolute inset-0 w-full h-full object-cover object-[center_10%] blur-sm scale-105"
                    onError={handleHeroImageError}
                />

                {/* Dark overlay */}
                <div className="absolute inset-0 bg-black/30" />

                {/* Left arrow */}
                <button className="absolute left-4 top-1/2 -translate-y-1/2 z-20 text-white w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 p-2" onClick={handleLeft}>
                    <FontAwesomeIcon icon={faChevronLeft} />
                </button>

                {/* Right arrow */}
                <button className="absolute right-4 top-1/2 -translate-y-1/2 z-20 text-white w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 p-2" onClick={handleRight}>
                    <FontAwesomeIcon icon={faChevronRight} />
                </button>

                {/* Hero content */}
                <div className="relative z-10 h-full flex items-center ml-[11%] px-4 sm:px-8 md:px-15">
                    <div className="text-white flex gap-16 items-center">

                        {/* Book cover */}
                        <img
                            key={`cover-${currentBook.id}`}
                            src={currentBook.coverUrl}
                            alt={currentBook.title}
                            className="w-30 sm:w-32 lg:w-72 rounded-xl border border-readflow-gold"
                            onError={handleHeroImageError}
                        />

                        {/* Book info */}
                        <div className="max-w-2xl">
                            <h1 className="text-7xl font-bold">
                                {featuredBooks[index].title}
                            </h1>

                            <p className="mt-5 text-xl text-readflow-textMuted">
                                {featuredBooks[index].synopsis}
                            </p>

                            <div className="flex gap-4 mt-6">
                                <button className="px-5 py-3 rounded-xl bg-readflow-primary cursor-pointer" onMouseEnter={() => setIsPaused(true)}
                                    onMouseLeave={() => setIsPaused(false)}
                                    onClick={() => onStartReading(featuredBooks[index])}>
                                    <FontAwesomeIcon icon={faPlay} /> Start Reading
                                </button>

                                <button className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer" onMouseEnter={() => setIsPaused(true)}
                                    onMouseLeave={() => setIsPaused(false)}>
                                    + Add to Library
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-20 left-0 w-full flex justify-center gap-2">
                    {featuredBooks.map((book, i) => (
                        <button
                            key={book.id}
                            onClick={() => setIndex(i)}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-white" : "w-2 bg-white/40"
                                }`}
                        />
                    ))}
                </div>

                <div className="absolute -bottom-2 left-0 w-full h-32 bg-gradient-to-t from-black/90 to-transparent z-40 pointer-events-none" />
            </section>

            {/* Mobile hero */}
            <section onClick={() => setIsPaused(prev => !prev)} className="block sm:hidden relative mx-4 mt-20 mb-5 h-[70vh] overflow-hidden rounded-2xl border border-white/20" onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}>
                {/* Background */}
                <img
                    key={`mobile-${currentBook.id}`}
                    src={currentBook.coverUrl}
                    alt={currentBook.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={handleHeroImageError}
                />

                {/* Dark gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

                {/* Content */}
                <div className="absolute bottom-8 left-0 w-full px-5 text-center text-white">

                    <h1 className="text-3xl font-bold">
                        {currentBook.title}
                    </h1>

                    <p className="text-sm text-white/70 mt-1">
                        {currentBook.author}
                    </p>

                    {/* Buttons */}
                    <div className="flex justify-center gap-3 mt-5">
                        <button
                            className="flex items-center gap-2 bg-white text-black px-6 py-2 rounded-lg font-semibold"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStartReading?.(currentBook);
                            }}
                        >
                            ▶ Read
                        </button>

                        <button className="flex items-center gap-2 bg-white/20 text-white px-6 py-2 rounded-lg font-semibold">
                            ＋ My List
                        </button>
                    </div>

                    {/* Carousel indicators */}
                    <div className="flex justify-center items-center gap-2 mt-5">
                        {featuredBooks.map((book, i) => (
                            <button
                                key={book.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIndex(i);
                                }}
                                className={`h-2 rounded-full transition-all duration-300 ${i === index
                                        ? "w-6 bg-white"
                                        : "w-2 bg-white/40"
                                    }`}
                            />
                        ))}
                    </div>

                </div>

            </section>
        </>
    )
}