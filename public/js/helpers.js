// Small helpers every page uses: building elements, calling the API, toasts and busy buttons.

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_YEAR = new Date().getFullYear() + 1;

// Build an element from text and child elements, never from HTML strings,
// so a game title can't inject markup into the page.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

// An icon from the sprite in icons.svg. It takes its colour from the surrounding text.
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

// Call the API and hand back the JSON. Failures become an Error with a readable message.
async function api(path, options = {}) {
  const init = { method: options.method || "GET", signal: AbortSignal.timeout(20000) };
  if (options.body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new Error(err.name === "TimeoutError"
      ? "The server took too long to answer. Try again."
      : "Can't reach the server. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A sign-in can run out while the page is open. Say so, so the page can ask for a new one.
    if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("session-ended"));
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

// A message that survives a page change, for "Saved" after leaving the edit page.
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

// Swap a button's contents for a label and spinner while a request is running,
// then put back whatever was inside.
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

