const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_YEAR = new Date().getFullYear() + 1;

// DOM element builder with XSS protection via textContent/attributes
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && typeof value !== "string" && typeof value !== "number") {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

function icon(id) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "icons.svg#" + id);
  svg.append(use);
  return svg;
}

async function api(path, options = {}) {
  const init = { method: options.method || "GET", signal: AbortSignal.timeout(20000) };
  const headers = { ...(options.headers || {}) };
  if (options.body instanceof Blob) {
    headers["Content-Type"] = options.body.type || "application/octet-stream";
    init.body = options.body;
  } else if (options.body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  try {
    const token = localStorage.getItem("mgv_token");
    if (token) headers["x-session-token"] = token;
  } catch {}
  init.headers = headers;

  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new Error(err.name === "TimeoutError"
      ? "The server took too long to answer. Try again."
      : "Can't reach the server. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (data && data.token) {
    try { localStorage.setItem("mgv_token", data.token); } catch {}
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) {
      try { localStorage.removeItem("mgv_token"); } catch {}
      window.dispatchEvent(new Event("session-ended"));
    }
    const error = new Error(data.error || "Something went wrong (" + res.status + ").");
    error.status = res.status;
    throw error;
  }
  return data;
}

function toast(message, type = "ok") {
  const node = el("div", { class: "toast " + type, text: message });
  $("toasts").append(node);
  setTimeout(() => {
    node.classList.add("leaving");
    node.addEventListener("animationend", () => node.remove(), { once: true });
  }, type === "error" ? 5500 : 3200);
}

function setFlash(message) {
  try { sessionStorage.setItem("flash", message); } catch {}
}

function takeFlash() {
  try {
    const message = sessionStorage.getItem("flash");
    sessionStorage.removeItem("flash");
    return message;
  } catch {
    return null;
  }
}

const idleContents = new WeakMap();
function setBusy(button, busy, busyLabel) {
  if (busy) {
    if (!idleContents.has(button)) idleContents.set(button, [...button.childNodes]);
    button.textContent = busyLabel;
  } else if (idleContents.has(button)) {
    button.replaceChildren(...idleContents.get(button));
    idleContents.delete(button);
  }
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
}

