import { useState, useEffect, useRef, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faWandMagicSparkles,
  faBookmark,
  faPaperPlane,
  faTrash,
  faKey,
  faArrowUpRightFromSquare,
  faMicrochip,
  faDownload,
} from "@fortawesome/free-solid-svg-icons";
import {
  LOCAL_AI_MODELS,
  DEFAULT_LOCAL_MODEL,
  checkChromeBuiltinAi,
  buildMeaningMessages,
  buildChatMessages,
  generateWithLocalAi,
  preloadLocalModel,
} from "../../utils/localAi";

export default function AISidebar({
  isOpen,
  onClose,
  initialTab = "ai",
  selectedSnippet,
  onClearSnippet,
  bookTitle,
  bookAuthor,
  annotations = [],
  onUpdateNote,
  onDeleteAnnotation,
  onJumpToPage,
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // "ai" | "notes"
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Local Web AI model state
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem("readwise_local_ai_model") || DEFAULT_LOCAL_MODEL
  );
  const [downloadProgress, setDownloadProgress] = useState(null); // 0..100 while downloading
  const [aiStatus, setAiStatus] = useState("Free Local Web AI · No API key needed");
  const [activeBackend, setActiveBackend] = useState(null);
  const [chromeAiReady, setChromeAiReady] = useState(false);

  // Optional user-supplied Gemini API key stored in localStorage
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("readwise_gemini_key") || ""
  );
  const [showKeyInput, setShowKeyInput] = useState(false);

  const lastHandledSnippetIdRef = useRef(null);
  const messagesEndRef = useRef(null);
  const apiKeyRef = useRef(apiKey);
  const selectedModelRef = useRef(selectedModel);
  const chromeAiReadyRef = useRef(chromeAiReady);
  const bookTitleRef = useRef(bookTitle);
  const bookAuthorRef = useRef(bookAuthor);
  const onClearSnippetRef = useRef(onClearSnippet);

  apiKeyRef.current = apiKey;
  selectedModelRef.current = selectedModel;
  chromeAiReadyRef.current = chromeAiReady;
  bookTitleRef.current = bookTitle;
  bookAuthorRef.current = bookAuthor;
  onClearSnippetRef.current = onClearSnippet;

  useEffect(() => {
    checkChromeBuiltinAi().then(setChromeAiReady);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSaveKey = (val) => {
    setApiKey(val);
    localStorage.setItem("readwise_gemini_key", val.trim());
  };

  const handleModelChange = (modelId) => {
    setSelectedModel(modelId);
    localStorage.setItem("readwise_local_ai_model", modelId);
    setActiveBackend(null);
    setDownloadProgress(null);
  };

  const runGeminiCloud = useCallback(async (userText) => {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyRef.current.trim()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a concise, insightful literary assistant inside the ReadWise e-reader. Book: "${
                    bookTitleRef.current || "Unknown"
                  }". ${userText}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await res.json();
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    throw new Error(data?.error?.message || "Gemini API request failed");
  }, []);

  const runInference = useCallback(async ({ userLabel, aiMessages, cloudPrompt }) => {
    const userMsgId = Date.now();
    const aiMsgId = userMsgId + 1;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: userLabel },
      { id: aiMsgId, role: "ai", text: "", pending: true },
    ]);
    setIsLoading(true);

    try {
      if (apiKeyRef.current.trim()) {
        setAiStatus("Using Gemini Cloud API (key configured)");
        const reply = await runGeminiCloud(cloudPrompt || userLabel);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, text: reply, pending: false, badge: "Gemini API" }
              : m
          )
        );
        return;
      }

      const useChromeBuiltin = selectedModelRef.current === "chrome-builtin";
      const modelToUse = useChromeBuiltin ? DEFAULT_LOCAL_MODEL : selectedModelRef.current;

      const { text, backend } = await generateWithLocalAi({
        messages: aiMessages,
        modelId: modelToUse,
        preferChromeBuiltin: useChromeBuiltin || chromeAiReadyRef.current,
        onProgress: (pct) => {
          setDownloadProgress(pct);
          setAiStatus(`Downloading local AI model (${pct}%) · Cached after 1st run`);
        },
        onStatus: (statusText, stage, resolvedBackend) => {
          setAiStatus(statusText);
          if (stage === "ready") {
            setDownloadProgress(null);
            if (resolvedBackend) setActiveBackend(resolvedBackend);
          }
        },
        onToken: (partialText) => {
          setDownloadProgress(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, text: partialText, pending: false } : m
            )
          );
        },
      });

      setDownloadProgress(null);
      if (backend) setActiveBackend(backend);
      setAiStatus(`Ready · Running locally in browser (${backend || "Local"})`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text: text || m.text || "Could not generate an explanation.",
                pending: false,
                badge: `Local AI · ${backend || "In-Browser"}`,
              }
            : m
        )
      );
    } catch (err) {
      setDownloadProgress(null);
      setAiStatus("Local AI error — click retry or switch model");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                text: `Error: ${err.message}. Try switching to Fast (SmolLM2 135M) above or retry.`,
                pending: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [runGeminiCloud]);

  const explainHighlighted = useCallback(async (snippetText, contextText = "") => {
    const clean = snippetText.trim();
    if (!clean) return;

    const aiMessages = buildMeaningMessages({
      snippet: clean,
      context: contextText,
      bookTitle: bookTitleRef.current,
      bookAuthor: bookAuthorRef.current,
    });

    await runInference({
      userLabel: `Meaning of: "${clean}"`,
      aiMessages,
      cloudPrompt: `Explain the meaning of "${clean}" from "${
        bookTitleRef.current || "the book"
      }"${contextText ? ` in this context: "${contextText}"` : ""}.`,
    });
  }, [runInference]);

  // Automatically explain highlighted snippet when sent via "Meaning"
  useEffect(() => {
    const snippetObj =
      typeof selectedSnippet === "string"
        ? selectedSnippet.trim()
          ? { id: selectedSnippet, text: selectedSnippet, context: "" }
          : null
        : selectedSnippet;

    if (!snippetObj?.text) return;
    if (lastHandledSnippetIdRef.current === snippetObj.id) return;
    lastHandledSnippetIdRef.current = snippetObj.id;

    Promise.resolve().then(() => {
      setActiveTab("ai");
      explainHighlighted(snippetObj.text, snippetObj.context || "");
      onClearSnippetRef.current?.();
    });
  }, [selectedSnippet, explainHighlighted]);

  const handleSubmitChat = async (e) => {
    e.preventDefault();
    const query = prompt.trim();
    if (!query || isLoading) return;
    setPrompt("");

    await runInference({
      userLabel: query,
      aiMessages: buildChatMessages({ query, bookTitle, bookAuthor }),
      cloudPrompt: query,
    });
  };

  const handlePreload = async () => {
    if (isLoading || selectedModel === "chrome-builtin") return;
    setIsLoading(true);
    try {
      const { backend } = await preloadLocalModel({
        modelId: selectedModel,
        onProgress: (pct) => {
          setDownloadProgress(pct);
          setAiStatus(`Downloading local AI model (${pct}%) · Cached after 1st run`);
        },
        onStatus: (statusText) => setAiStatus(statusText),
      });
      setDownloadProgress(null);
      setActiveBackend(backend);
      setAiStatus(`Ready · Running locally in browser (${backend})`);
    } catch (err) {
      setDownloadProgress(null);
      setAiStatus(`Load failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[420px] bg-[#121217]/95 backdrop-blur-xl border-l border-white/10 flex flex-col shadow-2xl">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("ai")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === "ai"
                ? "bg-readflow-gold/20 text-readflow-gold border border-readflow-gold/40"
                : "text-white/60 hover:text-white"
            }`}
          >
            <FontAwesomeIcon icon={faWandMagicSparkles} />
            Local Web AI
          </button>

          <button
            onClick={() => setActiveTab("notes")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === "notes"
                ? "bg-readflow-gold/20 text-readflow-gold border border-readflow-gold/40"
                : "text-white/60 hover:text-white"
            }`}
          >
            <FontAwesomeIcon icon={faBookmark} />
            Notes ({annotations.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowKeyInput((prev) => !prev)}
            title="Optional: Configure Gemini API Key (Local Web AI works free without a key)"
            className={`p-2 rounded-lg text-xs transition cursor-pointer ${
              apiKey
                ? "text-emerald-400 bg-emerald-500/10"
                : "text-white/50 hover:text-white bg-white/5"
            }`}
          >
            <FontAwesomeIcon icon={faKey} />
          </button>

          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white transition cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </div>

      {/* Free Local Web AI Engine Bar */}
      {activeTab === "ai" && !apiKey.trim() && (
        <div className="px-5 py-2.5 bg-white/[0.03] border-b border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 font-medium">
              <FontAwesomeIcon icon={faMicrochip} />
              <span>{activeBackend ? `Local AI (${activeBackend})` : "Free Local Web AI"}</span>
            </span>

            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={isLoading}
              className="bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white/85 outline-none focus:border-readflow-gold cursor-pointer"
            >
              {chromeAiReady && (
                <option value="chrome-builtin">Chrome Built-in AI (0 MB)</option>
              )}
              {LOCAL_AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.sizeHint})
                </option>
              ))}
            </select>
          </div>

          <div className="text-[11px] text-white/45 flex items-center justify-between gap-2">
            <span className="truncate">{aiStatus}</span>
            {!activeBackend && selectedModel !== "chrome-builtin" && !isLoading && (
              <button
                onClick={handlePreload}
                className="shrink-0 text-readflow-gold hover:underline flex items-center gap-1 cursor-pointer"
                title="Pre-download and cache model in browser"
              >
                <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                Preload
              </button>
            )}
          </div>

          {downloadProgress !== null && (
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-readflow-gold transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Collapsible Optional Gemini API Key Bar */}
      {showKeyInput && (
        <div className="px-5 py-3 bg-white/[0.03] border-b border-white/10">
          <label className="block text-[11px] text-white/60 mb-1.5">
            Optional Gemini API Key (leave blank to use Free Local Web AI)
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => handleSaveKey(e.target.value)}
            placeholder="AIzaSy... (optional)"
            className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/15 text-xs text-white outline-none focus:border-readflow-gold"
          />
        </div>
      )}

      {/* TAB 1: AI ASSISTANT */}
      {activeTab === "ai" && (
        <>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-xs text-white/45 mt-10 space-y-2 px-4">
                <p className="text-white/70 font-medium">
                  100% Free Local Web AI — runs right in your browser
                </p>
                <p>
                  Highlight any word or sentence in the book and click{" "}
                  <span className="text-readflow-gold font-medium">Meaning</span>,
                  or ask a question about "{bookTitle}" below.
                </p>
                <p className="text-[11px] text-white/30 pt-1">
                  First run downloads the compact model once and caches it locally in your browser.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-white/10 text-white ml-6"
                    : "bg-readflow-gold/10 border border-readflow-gold/20 text-gray-200 mr-4"
                }`}
              >
                {msg.pending && !msg.text ? (
                  <span className="text-readflow-gold animate-pulse">
                    {downloadProgress !== null
                      ? `Downloading local AI model (${downloadProgress}%)...`
                      : "Thinking locally..."}
                  </span>
                ) : (
                  msg.text
                )}
                {msg.badge && (
                  <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-white/35">
                    {msg.badge}
                  </div>
                )}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmitChat}
            className="p-4 border-t border-white/10 flex gap-2"
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask meaning, themes, or characters..."
              className="flex-1 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-readflow-gold"
            />
            <button
              type="submit"
              disabled={!prompt.trim() || isLoading}
              className="px-3.5 py-2 rounded-xl bg-readflow-gold text-black font-semibold text-xs disabled:opacity-40 cursor-pointer"
            >
              <FontAwesomeIcon icon={faPaperPlane} />
            </button>
          </form>
        </>
      )}

      {/* TAB 2: SAVED HIGHLIGHTS & NOTES */}
      {activeTab === "notes" && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {annotations.length === 0 ? (
            <div className="text-center text-xs text-white/40 mt-12 space-y-2">
              <p>No highlights or notes saved for this book yet.</p>
              <p>Select any text on the page and click Highlight or Note.</p>
            </div>
          ) : (
            annotations.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2.5"
              >
                <div className="flex items-center justify-between text-[11px] text-white/40">
                  <button
                    onClick={() => onJumpToPage?.(item.page)}
                    className="text-readflow-gold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Page {item.page}
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="text-[9px]"
                    />
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setActiveTab("ai");
                        explainHighlighted(item.text, "");
                      }}
                      className="text-readflow-gold/80 hover:text-readflow-gold flex items-center gap-1 cursor-pointer"
                      title="Get meaning with Local Web AI"
                    >
                      <FontAwesomeIcon icon={faWandMagicSparkles} />
                      <span>Meaning</span>
                    </button>
                    <span>{item.createdAt}</span>
                    <button
                      onClick={() => onDeleteAnnotation?.(item.id)}
                      className="text-white/40 hover:text-red-400 transition cursor-pointer"
                      title="Delete highlight"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>

                {/* Highlighted Quote */}
                <blockquote className="pl-3 border-l-2 border-readflow-gold text-xs italic text-gray-300">
                  "{item.text}"
                </blockquote>

                {/* Editable User Note */}
                <textarea
                  rows={2}
                  value={item.note}
                  onChange={(e) => onUpdateNote?.(item.id, e.target.value)}
                  placeholder="Add a personal note..."
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white/90 outline-none focus:border-readflow-gold resize-none"
                />
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
