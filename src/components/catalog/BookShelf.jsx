import React, { useRef } from "react";
import BookCard from "./BookCard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faChevronLeft,
    faChevronRight
} from "@fortawesome/free-solid-svg-icons";

export default function BookShelf({ title, books = [], onSelectBook }) {
    const rowRef = useRef(null);

    const scroll = (direction) => {
        if (rowRef.current) {
            rowRef.current.scrollBy({
                left: direction === "left" ? -500 : 500,
                behavior: "smooth"
            });
        }
    };

    return (
        <section className="relative group sm:px-8 md:px-15 mb-8">
            <h2 className="text-white text-xl font-semibold px-1">
                {title}
            </h2>

            <button
                onClick={() => scroll("left")}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20
                w-10 h-10 rounded-full bg-black/60 text-white
                flex items-center justify-center
                opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <FontAwesomeIcon icon={faChevronLeft} />
            </button>

            <div
                ref={rowRef}
                className="flex gap-3 sm:gap-4 md:gap-6 overflow-x-auto overflow-y-hidden scrollbar-hide py-2"
            >
                {books.map((book) => (
                    <BookCard
                        key={book.id}
                        book={book}
                        onSelect={onSelectBook}
                    />
                ))}
            </div>

            <button
                onClick={() => scroll("right")}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20
                w-10 h-10 rounded-full bg-black/60 text-white
                flex items-center justify-center
                opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <FontAwesomeIcon icon={faChevronRight} />
            </button>
        </section>
    );
}