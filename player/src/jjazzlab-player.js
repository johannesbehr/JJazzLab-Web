import { Sequencer, WorkletSynthesizer } from "spessasynth_lib";

const API_PATH = "/api/v1";
const SOUNDFONT_CACHE = "jjazzlab-player-soundfonts-v1";

function findBytes(haystack, needle, startAt) {
  outer: for (let i = startAt; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function parseMultipart(buffer, boundary) {
  const bytes = new Uint8Array(buffer);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const marker = encoder.encode("--" + boundary);
  const nextMarker = encoder.encode("\r\n--" + boundary);
  const separator = encoder.encode("\r\n\r\n");
  const parts = [];
  let markerAt = findBytes(bytes, marker, 0);

  while (markerAt >= 0) {
    let cursor = markerAt + marker.length;
    if (bytes[cursor] === 45 && bytes[cursor + 1] === 45) break;
    if (bytes[cursor] === 13 && bytes[cursor + 1] === 10) cursor += 2;
    const headerEnd = findBytes(bytes, separator, cursor);
    if (headerEnd < 0) throw new Error("Ungültige multipart-Antwort: Header fehlen.");

    const headers = {};
    for (const line of decoder.decode(bytes.slice(cursor, headerEnd)).split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }

    const bodyStart = headerEnd + separator.length;
    const nextAt = findBytes(bytes, nextMarker, bodyStart);
    if (nextAt < 0) throw new Error("Ungültige multipart-Antwort: Boundary fehlt.");
    parts.push({
      id: (headers["content-id"] || "").replace(/^<|>$/g, ""),
      body: bytes.slice(bodyStart, nextAt)
    });
    markerAt = nextAt + 2;
  }
  return parts;
}

async function readResponseBytes(response, onProgress) {
  const total = Number(response.headers.get("Content-Length")) || 0;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.(bytes.length, total);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

class JJazzLabPlayer extends HTMLElement {
  static observedAttributes = ["song-url", "render-server", "soundfont-url", "theme"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:var(--jj-text,#202124); font:14px/1.4 system-ui,sans-serif; }
        .player { box-sizing:border-box; display:flex; align-items:center; gap:10px; padding:12px 14px; border:1px solid var(--jj-border,#d8dce2); border-radius:10px; background:var(--jj-bg,#fff); }
        .controls { display:flex; align-items:center; gap:8px; }
        button { border:0; border-radius:7px; padding:8px 14px; background:var(--jj-accent,#315f9b); color:#fff; font:inherit; cursor:pointer; }
        button:disabled { opacity:.45; cursor:default; }
        .details { min-width:0; flex:1; }
        .status { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--jj-muted,#626a73); }
        progress { display:block; box-sizing:border-box; width:100%; height:5px; margin-top:7px; accent-color:var(--jj-accent,#315f9b); }
        progress[hidden] { display:none; }
        :host([theme="dark"]) { --jj-text:#f1f3f4; --jj-bg:#20242a; --jj-border:#454b54; --jj-muted:#b0b7c1; --jj-accent:#527fb9; }
      </style>
      <div class="player">
        <div class="controls">
          <button id="play" type="button" disabled>Play</button>
          <button id="stop" type="button" disabled>Stop</button>
        </div>
        <div class="details">
          <span class="status" id="status" role="status" aria-live="polite">Initialisiere …</span>
          <progress id="progress" max="100" hidden></progress>
        </div>
      </div>`;
    this.playButton = this.shadowRoot.querySelector("#play");
    this.stopButton = this.shadowRoot.querySelector("#stop");
    this.statusNode = this.shadowRoot.querySelector("#status");
    this.progressNode = this.shadowRoot.querySelector("#progress");
    this.playButton.addEventListener("click", () => this.togglePlayback());
    this.stopButton.addEventListener("click", () => this.stop());
    this.ready = false;
    this.loading = false;
    this.midiLoaded = false;
    this.context = null;
    this.synth = null;
    this.sequencer = null;
    this.midiBuffer = null;
    this.audioInitPromise = null;
  }

  connectedCallback() {
    this.loadAndRender().catch(error => this.fail(error));
  }

  attributeChangedCallback(name) {
    if (["song-url", "render-server"].includes(name) && this.isConnected && !this.loading) {
      this.loadAndRender().catch(error => this.fail(error));
    }
  }

  setStatus(message) {
    this.statusNode.textContent = message;
  }

  setProgress(message, loaded = null, total = 0) {
    this.setStatus(message);
    this.progressNode.hidden = false;
    if (total > 0) {
      this.progressNode.value = Math.min(100, loaded / total * 100);
    } else {
      this.progressNode.removeAttribute("value");
    }
  }

  hideProgress() {
    this.progressNode.hidden = true;
    this.progressNode.removeAttribute("value");
  }

  requiredAttribute(name) {
    const value = this.getAttribute(name)?.trim();
    if (!value) throw new Error(`Das Attribut "${name}" fehlt.`);
    return value;
  }

  async loadAndRender() {
    if (this.loading) return;
    this.loading = true;
    this.ready = false;
    this.playButton.disabled = true;
    this.stopButton.disabled = true;
    this.setProgress("Lade Song …");
    try {
      const songUrl = this.requiredAttribute("song-url");
      const renderServer = this.requiredAttribute("render-server").replace(/\/+$/, "");
      this.requiredAttribute("soundfont-url");

      const songResponse = await fetch(songUrl);
      if (!songResponse.ok) throw new Error(`Song konnte nicht geladen werden (HTTP ${songResponse.status}).`);
      const songBytes = await readResponseBytes(songResponse, (loaded, total) => {
        this.setProgress("Lade Song …", loaded, total);
      });
      const songBlob = new Blob([songBytes]);
      const songName = new URL(songUrl, document.baseURI).pathname.split("/").pop() || "song.sng";

      const form = new FormData();
      form.append("song", songBlob, songName);
      this.setProgress("Erzeuge MIDI …");
      const response = await fetch(renderServer + API_PATH + "/render", {
        method: "POST",
        headers: { Accept: "multipart/mixed, application/json" },
        body: form
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Render Server meldet HTTP ${response.status}: ${body.slice(0, 300)}`);
      }

      const contentType = response.headers.get("Content-Type") || "";
      const match = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;]+))/i);
      if (!contentType.toLowerCase().includes("multipart/mixed") || !match) {
        throw new Error("Render Server lieferte keine multipart/mixed-Antwort.");
      }

      const responseBytes = await readResponseBytes(response, (loaded, total) => {
        this.setProgress("Empfange MIDI …", loaded, total);
      });
      const parts = parseMultipart(responseBytes.buffer, (match[1] || match[2]).trim());
      const metadataPart = parts.find(part => part.id === "metadata");
      const midiPart = parts.find(part => part.id === "midi");
      if (!metadataPart || !midiPart) throw new Error("Render-Antwort enthält keine Metadata- und MIDI-Teile.");

      this.metadata = JSON.parse(new TextDecoder().decode(metadataPart.body));
      if (!this.metadata.success) throw new Error("Der Render-Vorgang war nicht erfolgreich.");
      this.midiBuffer = midiPart.body.slice().buffer;
      this.midiLoaded = false;
      this.ready = true;
      this.playButton.disabled = false;
      this.hideProgress();
      this.setStatus("Bereit");
    } finally {
      this.loading = false;
    }
  }

  async loadSoundfont() {
    const url = this.requiredAttribute("soundfont-url");
    if (!("caches" in window)) {
      this.setProgress("Lade SoundFont …");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`SoundFont konnte nicht geladen werden (HTTP ${response.status}).`);
      return readResponseBytes(response, (loaded, total) => this.setProgress("Lade SoundFont …", loaded, total));
    }

    const cache = await caches.open(SOUNDFONT_CACHE);
    const cached = await cache.match(url);
    if (cached) {
      this.setProgress("Lade SoundFont aus Cache …", 1, 1);
      return readResponseBytes(cached, (loaded, total) => this.setProgress("Lade SoundFont aus Cache …", loaded, total));
    }

    this.setProgress("Lade SoundFont …");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SoundFont konnte nicht geladen werden (HTTP ${response.status}).`);
    const cacheCopy = response.clone();
    const bytes = await readResponseBytes(response, (loaded, total) => {
      this.setProgress("Lade SoundFont …", loaded, total);
    });
    try {
      await cache.put(url, cacheCopy);
    } catch (error) {
      console.warn("JJazzLab Player: SoundFont konnte nicht im Cache gespeichert werden:", error);
    }
    return bytes;
  }

  async initializeAudio() {
    if (this.sequencer) return;
    if (this.audioInitPromise) return this.audioInitPromise;

    this.audioInitPromise = (async () => {
      this.setProgress("Initialisiere Audio-Engine …");
      this.context = new AudioContext();
      await this.context.audioWorklet.addModule(new URL("./spessasynth_processor.min.js", import.meta.url));
      this.synth = new WorkletSynthesizer(this.context);
      this.synth.connect(this.context.destination);

      const soundfontBytes = await this.loadSoundfont();
      this.setProgress("Initialisiere SoundFont …");
      await this.synth.soundBankManager.addSoundBank(soundfontBytes.buffer.slice(
        soundfontBytes.byteOffset,
        soundfontBytes.byteOffset + soundfontBytes.byteLength
      ), "main");
      await this.synth.isReady;
      this.sequencer = new Sequencer(this.synth);
      this.hideProgress();
    })();

    try {
      await this.audioInitPromise;
    } catch (error) {
      this.audioInitPromise = null;
      throw error;
    }
  }

  async togglePlayback() {
    if (!this.ready) return;
    this.playButton.disabled = true;
    try {
      await this.initializeAudio();
      await this.context.resume();
      if (this.sequencer.paused) {
        if (!this.midiLoaded) {
          this.sequencer.loadNewSongList([{ binary: this.midiBuffer }]);
          this.midiLoaded = true;
        }
        this.sequencer.play();
        this.playButton.textContent = "Pause";
        this.stopButton.disabled = false;
        this.setStatus("Wiedergabe");
        this.monitorPlayback();
      } else {
        this.sequencer.pause();
        this.playButton.textContent = "Play";
        this.setStatus("Pausiert");
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.playButton.disabled = false;
    }
  }

  monitorPlayback() {
    if (!this.sequencer || this.sequencer.paused) return;
    if (this.sequencer.isFinished) {
      this.playButton.textContent = "Play";
      this.stopButton.disabled = true;
      this.setStatus("Wiedergabe beendet");
      return;
    }
    requestAnimationFrame(() => this.monitorPlayback());
  }

  stop() {
    if (!this.sequencer) return;
    this.sequencer.pause();
    this.sequencer.currentTime = 0;
    this.synth?.stopAll(true);
    this.playButton.textContent = "Play";
    this.stopButton.disabled = true;
    this.setStatus("Gestoppt");
  }

  fail(error) {
    console.error("JJazzLab Player:", error);
    this.hideProgress();
    this.setStatus(error?.message || String(error));
    this.playButton.disabled = !this.ready;
  }
}

if (!customElements.get("jjazzlab-player")) {
  customElements.define("jjazzlab-player", JJazzLabPlayer);
}
