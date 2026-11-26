import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faPause, faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";

export default function PacerBar({ isPlaying, onTogglePlay, wpm, onIncrease, onDecrease }) {
    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 rounded-full bg-[#15151A]/90 border border-white/10 backdrop-blur-md shadow-2xl">
            <button
                onClick={onTogglePlay}
                className="w-10 h-10 rounded-full bg-readflow-primary hover:bg-red-700 flex items-center justify-center text-white transition cursor-pointer"
            >
                <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
            </button>

            <div className="flex items-center gap-2 border-l border-white/10 pl-4">
                <span className="text-xs uppercase tracking-wider text-white/50 font-semibold">Speed</span>
                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onDecrease}
                    className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 text-white text-xs flex items-center justify-center cursor-pointer"
                >
                    <FontAwesomeIcon icon={faMinus} />
                </button>

                <span className="text-sm font-bold text-readflow-gold min-w-[65px] text-center select-none">
                    {wpm} WPM
                </span>

                <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onIncrease}
                    className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 text-white text-xs flex items-center justify-center cursor-pointer"
                >
                    <FontAwesomeIcon icon={faPlus} />
                </button>
            </div>

            <span className="hidden md:inline text-xs text-white/40 border-l border-white/10 pl-4">
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80">Space</kbd> toggle
            </span>
        </div>
    );
}