const API_PATH = "/api/v1";

const urlInput = document.querySelector("#server-url");
const testButton = document.querySelector("#test-button");
const connectionStatus = document.querySelector("#connection-status");
const healthBadge = document.querySelector("#health-badge");
const stylesBadge = document.querySelector("#styles-badge");
const healthResult = document.querySelector("#health-result");
const stylesResult = document.querySelector("#styles-result");

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

async function getJson(baseUrl, endpoint) {
  const response = await fetch(baseUrl + API_PATH + endpoint, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    throw new Error("Expected JSON from " + endpoint + ", received: " + body.slice(0, 300));
  }
  if (!response.ok) {
    const message = data?.error?.message || response.statusText || "Request failed";
    throw new Error("HTTP " + response.status + ": " + message);
  }
  return data;
}

function renderStyles(data) {
  const styles = Array.isArray(data.styles) ? data.styles : [];
  stylesResult.replaceChildren();
  if (styles.length === 0) {
    stylesResult.className = "style-list empty";
    stylesResult.textContent = "The server returned no styles.";
    return 0;
  }

  stylesResult.className = "style-list";
  for (const style of styles) {
    const item = document.createElement("div");
    item.className = "style-item";

    const name = document.createElement("div");
    name.className = "style-name";
    name.textContent = style.name || style.id || "Unnamed style";

    const meta = document.createElement("div");
    meta.className = "style-meta";
    meta.textContent = [
      style.id ? "ID: " + style.id : "",
      style.source ? "Source: " + style.source : ""
    ].filter(Boolean).join(" · ");

    item.append(name, meta);
    stylesResult.append(item);
  }
  return styles.length;
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
  stylesResult.textContent = "Checking…";
  stylesResult.className = "style-list empty";
  setBadge(healthBadge, "neutral", "Running");
  setBadge(stylesBadge, "neutral", "Running");

  const outcomes = await Promise.allSettled([
    getJson(baseUrl, "/health"),
    getJson(baseUrl, "/styles")
  ]);

  const [health, styles] = outcomes;

  if (health.status === "fulfilled") {
    healthResult.textContent = JSON.stringify(health.value, null, 2);
    const ready = health.value.status === "ok";
    setBadge(healthBadge, ready ? "ok" : "fail", ready ? "Ready" : "Not ready");
  } else {
    healthResult.textContent = health.reason?.message || String(health.reason);
    setBadge(healthBadge, "fail", "Failed");
  }

  let styleCount = 0;
  if (styles.status === "fulfilled") {
    styleCount = renderStyles(styles.value);
    setBadge(stylesBadge, "ok", styleCount + " styles");
  } else {
    stylesResult.className = "style-list empty";
    stylesResult.textContent = styles.reason?.message || String(styles.reason);
    setBadge(stylesBadge, "fail", "Failed");
  }

  const allOk = health.status === "fulfilled"
    && health.value.status === "ok"
    && styles.status === "fulfilled";
  connectionStatus.textContent = allOk
    ? "Checks completed successfully. " + styleCount + " styles reported."
    : "One or more checks failed. See the details below.";
  testButton.disabled = false;
}

testButton.addEventListener("click", runChecks);
urlInput.addEventListener("keydown", event => {
  if (event.key === "Enter") runChecks();
});

if (location.protocol === "http:" || location.protocol === "https:") {
  urlInput.value = location.origin;
}
