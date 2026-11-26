import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHighlighter,
  faNoteSticky,
  faWandMagicSparkles,
  faCopy,
} from "@fortawesome/free-solid-svg-icons";

export default function SelectionToolbar({
  position,
  onHighlight,
  onNote,
  onExplain,
  onCopy,
}) {
  if (!position) return null;

  return (
    <div
      className="fixed z-50 flex items-center gap-1 px-2 py-1.5 rounded-xl bg-[#15151A]/95 border border-[#2A1F24] backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] -translate-x-1/2 animate-in fade-in zoom-in-95 duration-150 select-none"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevents selection from un-highlighting on click
    >
      <button
        onClick={onHighlight}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 transition cursor-pointer"
        title="Highlight"
      >
        <FontAwesomeIcon icon={faHighlighter} className="text-[#E5C07B]" />
        <span>Highlight</span>
      </button>

      <button
        onClick={onNote}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 transition cursor-pointer"
        title="Add Note"
      >
        <FontAwesomeIcon icon={faNoteSticky} className="text-white/70" />
        <span>Note</span>
      </button>

      <button
        onClick={onExplain}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-readflow-primary/20 hover:bg-readflow-primary/40 text-readflow-primary transition cursor-pointer border border-readflow-primary/30"
        title="Get meaning with Free Local Web AI"
      >
        <FontAwesomeIcon icon={faWandMagicSparkles} />
        <span>Meaning</span>
      </button>

      <div className="w-[1px] h-4 bg-white/10 mx-1" />

      <button
        onClick={onCopy}
        className="p-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
        title="Copy text"
      >
        <FontAwesomeIcon icon={faCopy} />
      </button>
    </div>
  );
}