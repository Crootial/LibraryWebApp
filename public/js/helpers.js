const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_YEAR = new Date().getFullYear() + 1;

// Builds an element. Text goes in as textContent, never as HTML, so data from RAWG or players can't inject markup.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && typeof value !== "string" && typeof value !== "number") node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((child) => child != null && child !== false));
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

// Browser storage can be switched off, so every use of it is allowed to fail
function tryStorage(area, method, ...args) {
  try {
    return window[area][method](...args);
  } catch {
    return null;
  }
}

// Calls the server with JSON (or a picture) and the saved session token, and gives up after 20 seconds
async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = body instanceof Blob ? body.type || "application/octet-stream" : "application/json";
  const token = tryStorage("localStorage", "getItem", "mgv_token");
  if (token) headers["x-session-token"] = token;

  let res;
  try {
    res = await fetch(path, { method, headers, body: body instanceof Blob ? body : body && JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  } catch (err) {
    throw new Error(err.name === "TimeoutError" ? "The server took too long to answer. Try again." : "Can't reach the server. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (data?.token) tryStorage("localStorage", "setItem", "mgv_token", data.token);
  if (res.ok) return data;
  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    tryStorage("localStorage", "removeItem", "mgv_token");
    window.dispatchEvent(new Event("session-ended"));
  }
  throw Object.assign(new Error(data.error || "Something went wrong (" + res.status + ")."), { status: res.status });
}

function toast(message, type = "ok") {
  const node = el("div", { class: "toast " + type, text: message });
  $("toasts").append(node);
  setTimeout(() => {
    node.classList.add("leaving");
    node.addEventListener("animationend", () => node.remove(), { once: true });
  }, type === "error" ? 5500 : 3200);
}

// A message for the next page, shown once (the edit page uses it after saving)
const setFlash = (message) => tryStorage("sessionStorage", "setItem", "flash", message);
function takeFlash() {
  const message = tryStorage("sessionStorage", "getItem", "flash");
  tryStorage("sessionStorage", "removeItem", "flash");
  return message;
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

// Two clicks to delete or remove: the first one arms the button ("Sure?") for four seconds
function confirmButton(props, confirm) {
  let disarm;
  const button = el("button", { type: "button", ...props, onclick: () => {
    if (button.dataset.armed === "true") {
      clearTimeout(disarm);
      return confirm(button);
    }
    button.dataset.armed = "true";
    button.textContent = "Sure?";
    disarm = setTimeout(() => {
      button.dataset.armed = "false";
      button.textContent = props.text;
    }, 4000);
  } });
  return button;
}
