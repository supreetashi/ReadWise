import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookBookmark, faCopyright, faHeart } from "@fortawesome/free-solid-svg-icons";
import { faGithub, faLinkedin } from "@fortawesome/free-brands-svg-icons";

const GITHUB_URL = "https://github.com/supreetashi";
const LINKEDIN_URL = "https://www.linkedin.com/in/supreet-a-809b0a223";
const PORTFOLIO_URL = "https://supreetashi.github.io/";

export default function Footer() {
    const scrollTo = (id) => (e) => {
        e.preventDefault();
        if (!id) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    return (
        <>
            <footer className="hidden sm:block w-full">
                <section className="flex text-white">
                    <div className="grid grid-cols-5 gap-15 py-15 px-15 w-full">
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-1">
                                <FontAwesomeIcon icon={faBookBookmark} className="text-4xl text-readflow-primary" />
                                <h1 className="text-4xl font-bold text-readflow-primary font-dancing">ReadWise</h1>
                            </div>
                            <p>Discover.Read.Repeat.</p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <h3 className="text-lg font-bold">Explore</h3>
                            <p><a href="#trending" onClick={scrollTo("trending")} className="text-white/75 hover:text-white transition">Trending Classics</a></p>
                            <p><a href="#library" onClick={scrollTo("library")} className="text-white/75 hover:text-white transition">My Library</a></p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <h3 className="text-lg font-bold">Genres</h3>
                            <p><a href="#genres" onClick={scrollTo("genres")} className="text-white/75 hover:text-white transition">Sci-Fi &amp; Adventure</a></p>
                            <p><a href="#genres" onClick={scrollTo("genres")} className="text-white/75 hover:text-white transition">Mystery &amp; Philosophy</a></p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <h3 className="text-lg font-bold">Developer</h3>
                            <p><a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className="text-white/75 hover:text-white transition">Portfolio</a></p>
                            <p><a href={`${GITHUB_URL}/ReadWise`} target="_blank" rel="noopener noreferrer" className="text-white/75 hover:text-white transition">Source Code</a></p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <h3 className="text-lg font-bold">Socials</h3>
                            <div className="flex gap-4">
                                <a
                                    href={GITHUB_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Supreet's GitHub"
                                    title="GitHub"
                                    className="text-white/80 hover:text-readflow-primary transition"
                                >
                                    <FontAwesomeIcon icon={faGithub} className="text-2xl" />
                                </a>
                                <a
                                    href={LINKEDIN_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Supreet's LinkedIn"
                                    title="LinkedIn"
                                    className="text-white/80 hover:text-readflow-primary transition"
                                >
                                    <FontAwesomeIcon icon={faLinkedin} className="text-2xl" />
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
                <hr className="border-white/15" />
                <div className="flex justify-center items-center gap-1 text-white py-5">
                    <FontAwesomeIcon icon={faCopyright} />
                    <p>
                        2026 <b className="text-readflow-primary font-dancing">ReadWise</b>. Made with{" "}
                        <FontAwesomeIcon icon={faHeart} className="text-readflow-primary" /> by{" "}
                        <a
                            href={PORTFOLIO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-readflow-gold underline-offset-4 hover:underline"
                        >
                            Supreet
                        </a>
                    </p>
                </div>
            </footer>

            <footer className="sm:hidden bg-[#0B0B0E] text-white px-6 py-10 pb-24">
                <div className="flex flex-col gap-8">
                    {/* Brand */}
                    <div>
                        <h2 className="text-2xl font-bold text-readflow-primary font-dancing">
                            ReadWise
                        </h2>
                        <p className="text-white/60 mt-2">
                            Discover. Read. Repeat.
                        </p>
                    </div>

                    {/* Links */}
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-semibold mb-3">Explore</h3>
                            <div className="flex flex-col gap-2 text-white/60">
                                <a href="#trending" onClick={scrollTo("trending")} className="hover:text-white">Popular</a>
                                <a href="#genres" onClick={scrollTo("genres")} className="hover:text-white">Genres</a>
                                <a href="#library" onClick={scrollTo("library")} className="hover:text-white">My Library</a>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Connect</h3>
                            <div className="flex flex-col gap-2 text-white/60">
                                <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">Portfolio</a>
                                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">GitHub</a>
                                <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">LinkedIn</a>
                            </div>
                        </div>
                    </div>

                    {/* Social */}
                    <div className="flex gap-5">
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Supreet's GitHub"
                            className="text-xl text-white/80 hover:text-readflow-primary transition"
                        >
                            <FontAwesomeIcon icon={faGithub} />
                        </a>
                        <a
                            href={LINKEDIN_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Supreet's LinkedIn"
                            className="text-xl text-white/80 hover:text-readflow-primary transition"
                        >
                            <FontAwesomeIcon icon={faLinkedin} />
                        </a>
                    </div>
                </div>

                <hr className="border-white/10 my-6" />

                <p className="text-center text-sm text-white/40">
                    © 2026 ReadWise · Made by Supreet
                </p>
            </footer>
        </>
    );
}
