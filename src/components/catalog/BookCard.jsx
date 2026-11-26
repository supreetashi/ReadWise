import { getBookCoverProxyUrl, resolveOpenLibraryCover } from "../../utils/bookApi";

export default function BookCard({ book, onSelect }) {
    if (!book) return null;

    const handleImageError = async (e) => {
        const img = e.currentTarget;
        if (!img.dataset.triedProxy) {
            img.dataset.triedProxy = "1";
            const proxyUrl = getBookCoverProxyUrl(book);
            if (proxyUrl && img.src !== new URL(proxyUrl, window.location.origin).href) {
                img.src = proxyUrl;
                return;
            }
        }
        if (!img.dataset.triedOl) {
            img.dataset.triedOl = "1";
            const olCover = await resolveOpenLibraryCover(book);
            if (olCover && img.isConnected) {
                img.src = olCover;
                return;
            }
        }
        img.onerror = null;
        if (book.generatedCover) {
            img.src = book.generatedCover;
        }
    };

    return (
        <div
            onClick={() => onSelect?.(book)}
            className="group relative flex-none w-24 sm:w-32 md:w-40 lg:w-44 cursor-pointer transition-transform duration-300 hover:scale-105"
        >
            <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-white/5">
                <img
                    src={book.coverUrl}
                    alt={book.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={handleImageError}
                />
            </div>

            <h3 className="hidden sm:block text-white mt-2 font-semibold line-clamp-2">
                {book.title}
            </h3>

            <p className="hidden sm:block text-white/60 text-sm">
                {book.author}
            </p>
        </div>
    );
}
