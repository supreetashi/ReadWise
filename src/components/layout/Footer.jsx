import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookBookmark, faCopyright, faHeart, } from "@fortawesome/free-solid-svg-icons";
import { faGithub, faLinkedin } from "@fortawesome/free-brands-svg-icons";

export default function Footer() {
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
                            <p><a href="">Browse Books</a></p>
                            <p><a href="">My Library</a></p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <h3 className="text-lg font-bold">Explore</h3>
                            <p><a href="">Browse Books</a></p>
                            <p><a href="">Browse Books</a></p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <h3 className="text-lg font-bold">Explore</h3>
                            <p><a href="">Browse Books</a></p>
                            <p><a href="">Browse Books</a></p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <h3 className="text-lg font-bold">socials</h3>
                            <div className="flex gap-2 ">
                                <a href=""><FontAwesomeIcon icon={faGithub} className="text-2xl" /></a>
                                <a href=""><FontAwesomeIcon icon={faLinkedin} className="text-2xl" /></a>
                            </div>
                        </div>
                    </div>
                </section>
                <hr className="border-white/15" />
                <div className="flex justify-center items-center gap-1 text-white py-5">
                    <FontAwesomeIcon icon={faCopyright} className="" />
                    <p>2026 <b className="text-readflow-primary font-dancing">ReadWise</b>. Made with  <FontAwesomeIcon icon={faHeart} className="text-readflow-primary" /> by Supreet</p>
                </div>
            </footer>

            <footer className="sm:hidden bg-[#0B0B0E] text-white px-6 py-10">

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
                                <span>Popular</span>
                                <span>Genres</span>
                                <span>Authors</span>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Help</h3>
                            <div className="flex flex-col gap-2 text-white/60">
                                <span>About</span>
                                <span>Contact</span>
                                <span>Privacy</span>
                            </div>
                        </div>

                    </div>

                    {/* Social */}
                    <div className="flex gap-5">
                        <FontAwesomeIcon icon={faGithub} />
                        <FontAwesomeIcon icon={faLinkedin} />
                    </div>

                </div>

                <hr className="border-white/10 my-6" />

                <p className="text-center text-sm text-white/40">
                    © 2026 ReadWise. All rights reserved.
                </p>

            </footer>
        </>
    )
}