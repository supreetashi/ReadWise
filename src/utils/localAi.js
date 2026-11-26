export const LOCAL_AI_MODELS = [
  {
    id: "HuggingFaceTB/SmolLM2-135M-Instruct",
    label: "Fast · SmolLM2 135M",
    sizeHint: "~115 MB",
    description: "Fastest download & instant word meanings",
  },
  {
    id: "HuggingFaceTB/SmolLM2-360M-Instruct",
    label: "Balanced · SmolLM2 360M",
    sizeHint: "~260 MB",
    description: "Better literary nuance and passage analysis",
  },
  {
    id: "onnx-community/Qwen2.5-0.5B-Instruct",
    label: "Smart · Qwen2.5 0.5B",
    sizeHint: "~460 MB",
    description: "Highest comprehension for complex passages",
  },
];

export const DEFAULT_LOCAL_MODEL = "HuggingFaceTB/SmolLM2-135M-Instruct";

let workerInstance = null;
let requestCounter = 0;

function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("../workers/localAiWorker.js", import.meta.url),
      { type: "module" }
    );
  }
  return workerInstance;
}

/**
 * Checks whether Chrome's built-in on-device Prompt API (Gemini Nano) is ready.
 */
export async function checkChromeBuiltinAi() {
  try {
    const api =
      (typeof self !== "undefined" && self.LanguageModel) ||
      (typeof window !== "undefined" && window.ai?.languageModel);
    if (!api) return false;

    if (typeof api.availability === "function") {
      const status = await api.availability();
      return status === "available" || status === "readily";
    }
    if (typeof api.capabilities === "function") {
      const caps = await api.capabilities();
      return caps?.available === "readily";
    }
  } catch {
    // not supported
  }
  return false;
}

async function generateWithChromeBuiltin({ messages, onToken }) {
  const api =
    (typeof self !== "undefined" && self.LanguageModel) ||
    window.ai?.languageModel;
  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const userMsg = messages.find((m) => m.role === "user")?.content || "";

  const session = await api.create({
    initialPrompts: systemMsg ? [{ role: "system", content: systemMsg }] : undefined,
  });

  try {
    if (typeof session.promptStreaming === "function") {
      const stream = session.promptStreaming(userMsg);
      let fullText = "";
      for await (const chunk of stream) {
        // Chrome streams either deltas or cumulative text depending on version
        fullText = chunk.startsWith(fullText) ? chunk : fullText + chunk;
        onToken?.(fullText);
      }
      return fullText.trim();
    }
    const result = await session.prompt(userMsg);
    onToken?.(result);
    return result.trim();
  } finally {
    session.destroy?.();
  }
}

/**
 * Build focused prompts so compact local models give crisp, accurate meanings.
 */
export function buildMeaningMessages({ snippet, context, bookTitle, bookAuthor }) {
  const cleanSnippet = (snippet || "").trim();
  const wordCount = cleanSnippet.split(/\s+/).filter(Boolean).length;
  const hasContext = context && context.trim() && context.trim() !== cleanSnippet;

  const systemPrompt =
    "You are ReadWise, a concise dictionary and reading assistant. Give clear, accurate, plain-English explanations without filler.";

  if (wordCount <= 4) {
    const userPrompt = [
      `Book: "${bookTitle || "Classic Book"}"${bookAuthor ? ` by ${bookAuthor}` : ""}`,
      `Highlighted text: "${cleanSnippet}"`,
      hasContext ? `Sentence context: "${context.trim().slice(0, 420)}"` : "",
      "",
      "Explain the meaning of the highlighted text clearly in 3 short parts:",
      "1. Meaning: simple definition.",
      "2. In this context: what it means in that sentence.",
      "3. Synonyms / simpler phrase: 2-3 simple words.",
    ]
      .filter(Boolean)
      .join("\n");

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
  }

  const userPrompt = [
    `Book: "${bookTitle || "Classic Book"}"${bookAuthor ? ` by ${bookAuthor}` : ""}`,
    `Highlighted passage: "${cleanSnippet.slice(0, 700)}"`,
    hasContext && cleanSnippet.length < 220
      ? `Surrounding paragraph: "${context.trim().slice(0, 500)}"`
      : "",
    "",
    "Explain the meaning of this highlighted passage concisely:",
    "1. Plain-English meaning (2-3 sentences).",
    "2. Key idea or tone in the story (1-2 sentences).",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

export function buildChatMessages({ query, bookTitle, bookAuthor }) {
  return [
    {
      role: "system",
      content: `You are ReadWise, a helpful reading assistant for "${
        bookTitle || "this book"
      }"${bookAuthor ? ` by ${bookAuthor}` : ""}. Be clear, accurate, and concise.`,
    },
    { role: "user", content: query.trim() },
  ];
}

/**
 * Preload / warm up the selected local Web AI model in the background worker.
 */
export function preloadLocalModel({ modelId, onProgress, onStatus }) {
  return new Promise((resolve, reject) => {
    const worker = getWorker();

    const handleMsg = (e) => {
      const msg = e.data || {};
      if (msg.type === "progress") {
        onProgress?.(msg.progress, msg.file);
      } else if (msg.type === "status") {
        onStatus?.(msg.message, msg.status);
      } else if (msg.type === "ready" && msg.modelId === modelId) {
        cleanup();
        resolve({ backend: msg.backend });
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message));
      }
    };

    const cleanup = () => worker.removeEventListener("message", handleMsg);
    worker.addEventListener("message", handleMsg);
    worker.postMessage({ type: "load", modelId });
  });
}

/**
 * Run free local Web AI (Chrome on-device AI if active, else in-browser Transformers.js worker).
 */
export async function generateWithLocalAi({
  messages,
  modelId = DEFAULT_LOCAL_MODEL,
  preferChromeBuiltin = false,
  onProgress,
  onStatus,
  onToken,
}) {
  if (preferChromeBuiltin) {
    const available = await checkChromeBuiltinAi();
    if (available) {
      onStatus?.("Generating with Chrome On-Device AI...", "generating");
      const text = await generateWithChromeBuiltin({ messages, onToken });
      return { text, backend: "Chrome Built-in AI" };
    }
  }

  const worker = getWorker();
  const requestId = ++requestCounter;

  return new Promise((resolve, reject) => {
    const handleMsg = (e) => {
      const msg = e.data || {};
      if (msg.type === "progress") {
        onProgress?.(msg.progress, msg.file);
      } else if (msg.type === "status") {
        onStatus?.(msg.message, msg.status);
      } else if (msg.type === "ready") {
        onStatus?.(`Model ready (${msg.backend})`, "ready", msg.backend);
      } else if (msg.type === "token" && msg.requestId === requestId) {
        onToken?.(msg.text);
      } else if (msg.type === "done" && msg.requestId === requestId) {
        cleanup();
        resolve({ text: msg.text, backend: msg.backend });
      } else if (msg.type === "error" && (!msg.requestId || msg.requestId === requestId)) {
        cleanup();
        reject(new Error(msg.message || "Local AI failed"));
      }
    };

    const cleanup = () => worker.removeEventListener("message", handleMsg);
    worker.addEventListener("message", handleMsg);

    worker.postMessage({
      type: "generate",
      requestId,
      modelId,
      messages,
      maxNewTokens: 220,
    });
  });
}
