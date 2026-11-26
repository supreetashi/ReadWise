import { pipeline, TextStreamer, env } from "@huggingface/transformers";

// Always fetch ONNX weights from HuggingFace Hub and cache them in browser storage
env.allowLocalModels = false;
env.useBrowserCache = true;

let activeModelId = null;
let activeBackend = null;
let generatorPromise = null;
let loadedGenerator = null;
let activeRequestId = null;

async function detectDeviceAndDtype() {
  try {
    if (typeof navigator !== "undefined" && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        const supportsF16 = adapter.features?.has("shader-f16");
        return {
          device: "webgpu",
          dtype: supportsF16 ? "q4f16" : "q4",
        };
      }
    }
  } catch {
    // WebGPU unavailable — fall back to WASM
  }
  return { device: "wasm", dtype: "q4" };
}

async function getGenerator(modelId) {
  if (loadedGenerator && activeModelId === modelId) {
    return { generator: loadedGenerator, backend: activeBackend };
  }

  if (generatorPromise && activeModelId === modelId) {
    return generatorPromise;
  }

  // Dispose any previously loaded model to free memory before switching
  if (loadedGenerator && activeModelId !== modelId) {
    try {
      await loadedGenerator.dispose?.();
    } catch {
      // ignore disposal errors
    }
    loadedGenerator = null;
  }

  activeModelId = modelId;

  generatorPromise = (async () => {
    const fileProgress = new Map();
    const { device, dtype } = await detectDeviceAndDtype();

    const emitProgress = (info) => {
      if (info?.status === "progress" && info?.file) {
        fileProgress.set(info.file, {
          loaded: info.loaded || 0,
          total: info.total || 0,
          progress: info.progress || 0,
        });

        let sumLoaded = 0;
        let sumTotal = 0;
        for (const item of fileProgress.values()) {
          sumLoaded += item.loaded;
          sumTotal += item.total;
        }
        const overall =
          sumTotal > 0
            ? Math.min(99, Math.round((sumLoaded / sumTotal) * 100))
            : Math.round(info.progress || 0);

        self.postMessage({
          type: "progress",
          modelId,
          file: info.file,
          progress: overall,
        });
      } else if (info?.status === "initiate") {
        self.postMessage({
          type: "status",
          status: "downloading",
          message: `Preparing ${modelId.split("/")[1]} (${device.toUpperCase()})...`,
        });
      }
    };

    try {
      self.postMessage({
        type: "status",
        status: "loading",
        message: `Loading ${modelId.split("/")[1]} on ${device.toUpperCase()}...`,
      });

      const gen = await pipeline("text-generation", modelId, {
        device,
        dtype,
        progress_callback: emitProgress,
      });

      loadedGenerator = gen;
      activeBackend = device.toUpperCase();
      self.postMessage({
        type: "ready",
        modelId,
        backend: activeBackend,
      });
      return { generator: gen, backend: activeBackend };
    } catch (err) {
      // If WebGPU initialization fails on this hardware, retry cleanly on WASM CPU
      if (device === "webgpu") {
        self.postMessage({
          type: "status",
          status: "loading",
          message: `Switching ${modelId.split("/")[1]} to CPU (WASM)...`,
        });

        const gen = await pipeline("text-generation", modelId, {
          device: "wasm",
          dtype: "q4",
          progress_callback: emitProgress,
        });

        loadedGenerator = gen;
        activeBackend = "WASM";
        self.postMessage({
          type: "ready",
          modelId,
          backend: activeBackend,
        });
        return { generator: gen, backend: activeBackend };
      }

      activeModelId = null;
      throw err;
    } finally {
      generatorPromise = null;
    }
  })();

  return generatorPromise;
}

self.addEventListener("message", async (event) => {
  const data = event.data || {};

  if (data.type === "load") {
    try {
      await getGenerator(data.modelId);
    } catch (err) {
      self.postMessage({
        type: "error",
        message: err?.message || "Failed to initialize local AI model.",
      });
    }
    return;
  }

  if (data.type === "abort") {
    activeRequestId = null;
    return;
  }

  if (data.type === "generate") {
    const { requestId, modelId, messages, maxNewTokens = 220 } = data;
    activeRequestId = requestId;

    try {
      const { generator, backend } = await getGenerator(modelId);
      if (activeRequestId !== requestId) return;

      self.postMessage({
        type: "status",
        status: "generating",
        message: `Generating locally (${backend})...`,
      });

      let streamedText = "";
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (delta) => {
          if (activeRequestId !== requestId) return;
          streamedText += delta;
          self.postMessage({
            type: "token",
            requestId,
            delta,
            text: streamedText,
          });
        },
      });

      const output = await generator(messages, {
        max_new_tokens: maxNewTokens,
        do_sample: false,
        repetition_penalty: 1.15,
        streamer,
      });

      if (activeRequestId !== requestId) return;

      const generated =
        output?.[0]?.generated_text?.at(-1)?.content?.trim() ||
        streamedText.trim();

      self.postMessage({
        type: "done",
        requestId,
        text: generated,
        backend,
      });
    } catch (err) {
      if (activeRequestId !== requestId) return;
      self.postMessage({
        type: "error",
        requestId,
        message: err?.message || "Local AI generation failed.",
      });
    }
  }
});
