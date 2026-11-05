const API_PATH = "/api/v1";

const urlInput = document.querySelector("#server-url");
const testButton = document.querySelector("#test-button");
const connectionStatus = document.querySelector("#connection-status");
const healthBadge = document.querySelector("#health-badge");
const healthResult = document.querySelector("#health-result");
const songFileInput = document.querySelector("#song-file");
const renderButton = document.querySelector("#render-button");
const renderBadge = document.querySelector("#render-badge");
const renderResult = document.querySelector("#render-result");
const midiDownload = document.querySelector("#midi-download");

let serverReady = false;
let midiObjectUrl = null;

function setBadge(element, state, label) {
  element.className = "badge " + state;
  element.textContent = label;
}

function getBaseUrl() {
  const raw = urlInput.value.trim();
  if (!raw) throw new Error("Please enter a Render Server URL.");
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  return parsed.href.replace(/\/+$/, "");
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Expected JSON, received: " + text.slice(0, 300));
  }
}

async function runChecks() {
  let baseUrl;
  try {
    baseUrl = getBaseUrl();
  } catch (error) {
    connectionStatus.textContent = error.message;
    return;
  }

  testButton.disabled = true;
  connectionStatus.textContent = "Connecting to " + baseUrl + " …";
  healthResult.textContent = "Checking…";
  setBadge(healthBadge, "neutral", "Running");
  serverReady = false;
  renderButton.disabled = true;

  try {
    const response = await fetch(baseUrl + API_PATH + "/health", {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    const data = await readJson(response);
    healthResult.textContent = JSON.stringify(data, null, 2);

    serverReady = response.ok && data.status === "ok";
    setBadge(healthBadge, serverReady ? "ok" : "fail",
      serverReady ? "Ready" : "Not ready");

    connectionStatus.textContent = serverReady
      ? "Render Server is ready."
      : "Render Server responded, but the rendering engine is not ready (HTTP " + response.status + ").";
  } catch (error) {
    healthResult.textContent = error.message || String(error);
    setBadge(healthBadge, "fail", "Failed");
    connectionStatus.textContent = "Could not connect to the Render Server.";
  } finally {
    testButton.disabled = false;
    renderButton.disabled = !serverReady || !songFileInput.files.length;
  }
}

function findBytes(haystack, needle, startAt) {
  outer: for (let i = startAt; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function parseMultipart(arrayBuffer, boundary) {
  const bytes = new Uint8Array(arrayBuffer);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const marker = encoder.encode("--" + boundary);
  const nextMarker = encoder.encode("\r\n--" + boundary);
  const headerSeparator = encoder.encode("\r\n\r\n");
  const parts = [];

  let markerAt = findBytes(bytes, marker, 0);
  while (markerAt >= 0) {
    let cursor = markerAt + marker.length;

    // Final boundary.
    if (bytes[cursor] === 45 && bytes[cursor + 1] === 45) break;
    if (bytes[cursor] === 13 && bytes[cursor + 1] === 10) cursor += 2;

    const headerEnd = findBytes(bytes, headerSeparator, cursor);
    if (headerEnd < 0) throw new Error("Malformed multipart response: missing part headers.");

    const headerText = decoder.decode(bytes.slice(cursor, headerEnd));
    const headers = {};
    for (const line of headerText.split("\r\n")) {
      const colon = line.indexOf(":");
      if (colon > 0) {
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      }
    }

    const bodyStart = headerEnd + headerSeparator.length;
    const nextAt = findBytes(bytes, nextMarker, bodyStart);
    if (nextAt < 0) throw new Error("Malformed multipart response: closing boundary not found.");

    const contentId = (headers["content-id"] || "").replace(/^<|>$/g, "");
    parts.push({
      contentId,
      contentType: headers["content-type"] || "",
      body: bytes.slice(bodyStart, nextAt)
    });

    markerAt = nextAt + 2;
  }

  return parts;
}

async function renderSong() {
  let baseUrl;
  try {
    baseUrl = getBaseUrl();
  } catch (error) {
    renderResult.textContent = error.message;
    return;
  }

  const file = songFileInput.files[0];
  if (!file) {
    renderResult.textContent = "Please select a .sng file.";
    return;
  }

  const formData = new FormData();
  formData.append("song", file, file.name);

  renderButton.disabled = true;
  setBadge(renderBadge, "neutral", "Rendering");
  renderResult.textContent = "Uploading song and generating MIDI…";
  midiDownload.hidden = true;

  try {
    const response = await fetch(baseUrl + API_PATH + "/render", {
      method: "POST",
      headers: { "Accept": "multipart/mixed, application/json" },
      body: formData
    });

    if (!response.ok) {
      const errorData = await readJson(response);
      renderResult.textContent = JSON.stringify(errorData, null, 2);
      setBadge(renderBadge, "fail", "HTTP " + response.status);
      return;
    }

    const contentType = response.headers.get("Content-Type") || "";
    const boundaryMatch = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^;]+))/i);
    if (!contentType.toLowerCase().includes("multipart/mixed") || !boundaryMatch) {
      throw new Error("Expected a multipart/mixed response, received: " + contentType);
    }

    const boundary = (boundaryMatch[1] || boundaryMatch[2]).trim();
    const parts = parseMultipart(await response.arrayBuffer(), boundary);
    const metadataPart = parts.find(part => part.contentId === "metadata");
    const midiPart = parts.find(part => part.contentId === "midi");

    if (!metadataPart || !midiPart) {
      throw new Error("The multipart response must contain <metadata> and <midi> parts.");
    }

    const metadata = JSON.parse(new TextDecoder().decode(metadataPart.body));
    if (!metadata.success) {
      throw new Error("The metadata part did not report a successful render.");
    }

    renderResult.textContent = JSON.stringify(metadata, null, 2);

    if (midiObjectUrl) URL.revokeObjectURL(midiObjectUrl);
    const midiBlob = new Blob([midiPart.body], { type: "audio/midi" });
    midiObjectUrl = URL.createObjectURL(midiBlob);
    midiDownload.href = midiObjectUrl;
    midiDownload.download = file.name.replace(/\.sng$/i, "") + ".mid";
    midiDownload.hidden = false;

    setBadge(renderBadge, "ok", "Success");
    connectionStatus.textContent = "Render completed successfully.";
  } catch (error) {
    renderResult.textContent = error.message || String(error);
    setBadge(renderBadge, "fail", "Failed");
  } finally {
    renderButton.disabled = !serverReady || !songFileInput.files.length;
  }
}

testButton.addEventListener("click", runChecks);
renderButton.addEventListener("click", renderSong);
songFileInput.addEventListener("change", () => {
  renderButton.disabled = !serverReady || !songFileInput.files.length;
  if (songFileInput.files.length) {
    renderResult.textContent = "Selected: " + songFileInput.files[0].name;
  }
});
urlInput.addEventListener("keydown", event => {
  if (event.key === "Enter") runChecks();
});

urlInput.value = "https://wmager.ddns.net/java/jjazzlab-render-server";
