// MyGameVault front end. Shared helpers first, then one setup function per page.
//
// The API stores a game as { id, title, platforms: [names], rating, released, image, genres, rawg_id }.
// Games added by hand carry fewer of those, so every reader below copes with missing fields.
// A collection, a wishlist, search results and the trending list all hold games in that shape.
// The collection and the wishlist belong to the signed-in account; search and trending are open to all.

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

// ---------- Reading a game ----------

// The platform names saved on a game, however they were stored: a list, a bare string, [""] from
// an empty box, or one box holding several names ("PC, PS5"). RAWG's own names have no commas.
function platformNames(game) {
  const list = Array.isArray(game.platforms) ? game.platforms : [game.platforms];
  return list.flatMap((entry) => String(entry ?? "").split(",")).map((name) => name.trim()).filter(Boolean);
}

// What to draw for a game's platforms: one entry per system we know (PS4 and PS5 both
// become PlayStation), and one per name we don't.
function platformTags(game) {
  const tags = [];
  const seen = new Set();
  for (const name of platformNames(game)) {
    const known = platformFor(name);
    const key = known ? known.id : "other:" + name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(known
      ? { platform: known, label: known.abbr, title: known.name }
      : { platform: platformById("other"), label: name, title: name });
  }
  return tags;
}

// RAWG sends 0 or "N/A" for a game nobody has rated.
function ratingOf(game) {
  const n = parseFloat(game.rating);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// released is "2020-12-10", "2017" (typed by hand) or "N/A".
function yearOf(game) {
  const match = /^\d{4}/.exec(String(game.released ?? "").trim());
  return match ? Number(match[0]) : null;
}

const genresOf = (game) =>
  Array.isArray(game.genres) ? game.genres.filter((g) => typeof g === "string" && g) : [];

const imageOf = (game) =>
  typeof game.image === "string" && /^https?:\/\//i.test(game.image) ? game.image : null;

const titleKey = (game) => String(game.title ?? "").trim().toLowerCase();

// Two entries are the same game when they share a RAWG id or a title.
const sameGame = (a, b) =>
  Boolean((a.rawg_id && a.rawg_id === b.rawg_id) || (titleKey(a) && titleKey(a) === titleKey(b)));

// RAWG will serve a smaller copy of its pictures, which loads faster than the full size.
const artUrl = (url) =>
  url.startsWith("https://media.rawg.io/media/") && !url.includes("/media/crop/")
    ? url.replace("/media/", "/media/crop/600/400/")
    : url;

// ---------- Pieces of a card ----------

// The picture on a card: RAWG's art when there is some, laid over a tile holding the game's
// console icon. If the art won't load the tile shows through instead. The size is "sm" for a
// search result, "lg" for a trending game, and left out for a card in a list.
function cover(game, size = "") {
  const first = platformTags(game)[0];
  const platform = first ? first.platform : platformById("other");
  const tile = el("div", {
    class: "cover" + (size ? " cover-" + size : ""),
    "data-brand": platform.brand,
    "aria-hidden": "true",
  }, icon(platform.id));
  const image = imageOf(game);
  if (image) {
    const art = el("img", { src: artUrl(image), alt: "", loading: "lazy", decoding: "async" });
    art.addEventListener("error", () => {
      if (art.src !== image) art.src = image; // the resized copy failed, so try the original
      else art.remove();
    });
    tile.append(art);
  }
  return tile;
}

function platformChip(tag) {
  return el("span", { class: "chip chip-platform", title: tag.title },
    icon(tag.platform.id),
    el("span", { text: tag.label }),
  );
}

function ratingChip(rating) {
  return el("span", { class: "chip chip-rating", title: "Rating out of 5" },
    icon("star"),
    el("span", { text: rating.toFixed(1) }),
  );
}

// The title, genres and chips at the centre of a card.
function cardBody(game, className = "game-body") {
  const rating = ratingOf(game);
  const year = yearOf(game);
  const genres = genresOf(game);
  return el("div", { class: className },
    el("h3", { class: "game-title", text: game.title || "Untitled game" }),
    genres.length ? el("p", { class: "game-meta", text: genres.slice(0, 3).join(" · ") }) : null,
    el("p", { class: "tags" },
      rating ? ratingChip(rating) : null,
      year ? el("span", { class: "chip", text: year }) : null,
      ...platformTags(game).map(platformChip),
    ),
  );
}

// Fill in one of the dashed boxes that stand in for a list: a heading and a line of text, and
// either a Try again button (retry) or buttons that lead elsewhere (links). A link with a mode
// opens the Account tab on Sign in or on Create account.
function fillEmpty(box, { title, text, retry, links = [] }) {
  box.querySelector("h3").textContent = title;
  box.querySelector("p").textContent = text;
  const button = box.querySelector("button");
  if (button) {
    button.hidden = !retry;
    button.onclick = retry || null;
  }
  const actions = box.querySelector(".empty-actions");
  actions.hidden = !links.length;
  actions.replaceChildren(...links.map((link) => el("a", {
    class: "btn " + (link.primary ? "btn-primary" : "btn-ghost"),
    href: link.href,
    text: link.text,
    ...(link.mode ? { "data-mode": link.mode } : {}),
  })));
  box.hidden = false;
}

// What a signed-out visitor is offered in place of their collection and wishlist.
const SIGN_IN_LINKS = [
  { text: "Sign in", href: "#account", primary: true, mode: "signin" },
  { text: "Create account", href: "#account", mode: "signup" },
];

// ---------- Game details (the dropdown on a card) ----------

// RAWG's search results leave out the developer, the publisher and more. The backend serves those
// from RAWG's page for a single game, so a card fetches them the first time it is opened. The
// request is remembered, so opening the same game twice, or in two places, asks RAWG only once.
const detailsCache = new Map();

// The parts of RAWG's page that the dropdown shows and a game keeps. A key the server leaves out is
// filled with null, so a game that has been looked up always holds all of them. Anything else a
// server sends, such as a description, is ignored rather than saved.
const DETAIL_KEYS = ["developers", "publishers", "website", "esrb", "metacritic", "playtime"];
const pickDetails = (extra) => Object.fromEntries(DETAIL_KEYS.map((key) => [key, extra?.[key] ?? null]));

function fetchDetails(rawgId) {
  if (!detailsCache.has(rawgId)) {
    const request = api("/api/lookup/" + encodeURIComponent(rawgId)).then(pickDetails);
    request.catch(() => detailsCache.delete(rawgId)); // a failed request can be tried again
    detailsCache.set(rawgId, request);
  }
  return detailsCache.get(rawgId);
}

// Developers and publishers are saved as lists of names. A box typed by hand may hold "A, B".
const listOf = (value) =>
  (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);

// A saved game has had its RAWG details fetched once it holds the age rating. The server always
// sends that, as null for a game nobody has rated, so it shows a lookup happened even when RAWG
// had little to add.
const detailsFetched = (game) => game.esrb !== undefined;

// Fill in only what the game doesn't have yet. Its own values win, since someone may have typed
// a developer in by hand.
function withDetails(game, extra) {
  const merged = { ...game };
  for (const [key, value] of Object.entries(extra || {})) {
    if (merged[key] === undefined) merged[key] = value;
  }
  return merged;
}

const distinct = (names) =>
  names.filter((name, i) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === i);

// "2020-12-10" becomes "December 10, 2020". A bare year stays a year.
function formatDate(released) {
  const text = String(released ?? "").trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (full) {
    const date = new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    }
  }
  const year = yearOf({ released: text });
  return year ? String(year) : null;
}

function websiteLink(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  return el("a", { class: "text-link", href: url, target: "_blank", rel: "noopener noreferrer", text: host });
}

function detailItem(label, content, wide = false) {
  return el("div", { class: wide ? "detail detail-wide" : "detail" },
    el("dt", { text: label }),
    el("dd", {}, ...[].concat(content)),
  );
}

// A platform with its full name, as RAWG spells it, rather than the short label on a card.
function fullPlatformChip(name) {
  const platform = platformFor(name) || platformById("other");
  return el("span", { class: "chip chip-platform chip-full", title: name },
    icon(platform.id),
    el("span", { text: name }),
  );
}

// The rows of a game's details, worded like the plain first version of the page: Release Date,
// Genres and Platforms, with "N/A" for a game that has none. Those come from the saved game
// itself, so they show on any machine, even one that can't reach RAWG.
//
// The rows come in three groups, so the second always sits on a row of its own:
//   1. release date, genres and the ratings (age rating, Metacritic, rating, playtime)
//   2. developer and publisher, under the ratings. They appear once they are known (`credits`)
//   3. platforms and website
function detailList(info, { credits = true } = {}) {
  const developers = listOf(info.developers);
  const publishers = listOf(info.publishers);
  const genres = genresOf(info);
  const rating = ratingOf(info);
  const platforms = distinct(platformNames(info));
  const site = websiteLink(info.website);
  const group = (...items) => el("dl", { class: "detail-list" }, ...items);
  return el("div", { class: "detail-groups" },
    group(
      detailItem("Release Date", formatDate(info.released) || "N/A"),
      detailItem("Genres", genres.join(" · ") || "N/A"),
      info.esrb ? detailItem("Age rating", info.esrb) : null,
      info.metacritic ? detailItem("Metacritic", String(info.metacritic)) : null,
      rating ? detailItem("Rating", rating.toFixed(1) + " / 5") : null,
      info.playtime ? detailItem("Average playtime", info.playtime + " hours") : null,
    ),
    credits
      ? group(
          detailItem("Developer", developers.join(" · ") || "N/A"),
          detailItem("Publisher", publishers.join(" · ") || "N/A"),
        )
      : null,
    group(
      detailItem("Platforms",
        platforms.length ? el("span", { class: "detail-chips" }, ...platforms.map(fullPlatformChip)) : "N/A",
        true),
      site ? detailItem("Website", site, true) : null,
    ),
  );
}

// The dropdown at the foot of a card. It is a real <details> element, so the mouse, Enter and
// Space all open it and screen readers announce it. Its contents are built when it first opens.
//   isOpen   - start open. The list is redrawn often, and a card that was open should stay open.
//   onToggle - told when it opens or closes.
//   onLoaded - given the details fetched from RAWG, so a saved game can keep them.
function detailsPanel(game, { isOpen = false, onToggle, onLoaded } = {}) {
  const body = el("div", { class: "more-body" });
  const more = el("details", { class: "more" },
    el("summary", {},
      el("span", { class: "when-closed", text: "Show Details" }),
      el("span", { class: "when-open", text: "Hide Details" }),
      icon("chevron"),
    ),
    body,
  );

  // A server that wasn't restarted after an update has no details route, and answers 404 with a
  // plain page rather than a message.
  const reasonFor = (err) =>
    /\(404\)/.test(err.message) ? "This server may need updating. Restart it with the latest code." : err.message;

  async function fill() {
    // Games added by hand have no RAWG page, and saved ones may already hold their details.
    if (!game.rawg_id || detailsFetched(game)) {
      body.replaceChildren(detailList(game));
      if (!game.rawg_id && !listOf(game.developers).length && !listOf(game.publishers).length) {
        body.append(el("p", { class: "more-note", text: "Added by hand. Edit the game to fill in a developer and publisher." }));
      }
      return;
    }

    // Developer, publisher and the other extras need a trip to RAWG. What the saved game already
    // holds shows straight away, so the dropdown is never empty, and the extras join in when they
    // arrive. If they never do, everything else stays on show.
    const credits = game.developers !== undefined || game.publishers !== undefined;
    const basics = () => detailList(game, { credits });
    body.replaceChildren(
      basics(),
      el("p", { class: "more-status loading", role: "status", text: "Loading developer, publisher and more" }),
    );
    try {
      const extra = await fetchDetails(game.rawg_id);
      if (onLoaded) onLoaded(extra);
      body.replaceChildren(detailList(withDetails(game, extra)));
    } catch (err) {
      const retry = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Try again" });
      retry.addEventListener("click", fill);
      body.replaceChildren(
        basics(),
        el("p", { class: "more-status", role: "alert", text: "Developer, publisher and more couldn't be loaded. " + reasonFor(err) }),
        retry,
      );
    }
  }

  let filled = false;
  const build = () => {
    if (filled) return;
    filled = true;
    fill();
  };
  more.addEventListener("toggle", () => {
    if (onToggle) onToggle(more.open);
    if (more.open) build();
  });
  if (isOpen) {
    more.open = true;
    build();
  }
  return more;
}

// ---------- Platform picker ----------

// Fill a form's platform tiles. Each tile is a checkbox underneath, so it works with the
// keyboard and screen readers, and a game can sit on as many platforms as it needs.
function buildPicker(form, selected = []) {
  const options = PLATFORMS.map((p) =>
    el("label", { class: "platform-option", "data-brand": p.brand, title: p.name },
      el("input", { type: "checkbox", name: "platform", value: p.id, "aria-label": p.name }),
      el("span", { class: "platform-tile" },
        icon(p.id),
        el("span", { class: "platform-abbr", text: p.abbr }),
      ),
    ));
  form.querySelector(".platform-grid").replaceChildren(...options);
  checkPlatforms(form, selected);
}

function checkPlatforms(form, ids) {
  for (const box of form.querySelectorAll("input[name=platform]")) box.checked = ids.includes(box.value);
}

const checkedPlatforms = (form) =>
  [...form.querySelectorAll("input[name=platform]:checked")].map((box) => box.value);

// The systems on a game that have a tile in the picker. Names we don't recognise have none.
const knownPlatformIds = (game) =>
  [...new Set(platformNames(game).map((name) => platformFor(name)).filter(Boolean).map((p) => p.id))];

// ---------- Forms ----------

// The same rule the server applies to a new account's username.
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;

// Read a game form. Gives back { values } or { error, field }.
function readForm(form) {
  const title = form.elements.title.value.trim();
  const rating = form.elements.rating.value.trim();
  const year = form.elements.year.value.trim();
  const developers = listOf(form.elements.developer.value);
  const publishers = listOf(form.elements.publisher.value);
  if (!title) return { error: "Give the game a title.", field: "title" };
  if (rating && (!/^\d(\.\d{1,2})?$/.test(rating) || Number(rating) > 5)) {
    return { error: "Rating should be a number from 0 to 5, like 4.5.", field: "rating" };
  }
  if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > MAX_YEAR)) {
    return { error: "Year should be a number between 1 and " + MAX_YEAR + ".", field: "year" };
  }
  return {
    values: {
      title,
      platformIds: checkedPlatforms(form),
      rating: rating ? Number(rating) : null,
      year: year ? Number(year) : null,
      developers,
      publishers,
    },
  };
}

function clearFormError(form) {
  form.querySelector(".form-error").hidden = true;
  for (const input of form.querySelectorAll("input")) input.removeAttribute("aria-invalid");
}

function showFormError(form, message, field) {
  clearFormError(form);
  const box = form.querySelector(".form-error");
  box.textContent = message;
  box.hidden = false;
  if (field) {
    form.elements[field].setAttribute("aria-invalid", "true");
    form.elements[field].focus();
  }
}

// Clear the error as soon as the person starts typing again.
function watchForm(form) {
  form.addEventListener("input", () => clearFormError(form));
}

// ---------- Tabs ----------

// The Account panel has no tab of its own: the button in the masthead opens it.
const PANEL_NAMES = ["home", "collection", "wishlist", "lookup", "add", "account"];

// The games page holds six panels, five of them behind the tab bar. Choosing a tab shows its
// panel and hides the others. The address keeps the choice (index.html#lookup), so a refresh,
// the back button and the links on the edit page all land on the right tab.
// It gives back back(): the panel that was open before the Account one, where signing in returns to.
function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll(".panel")];
  const bar = document.querySelector(".tabbar");
  let shown = "home";
  let before = "home";

  const fromAddress = () => {
    const name = location.hash.slice(1);
    return PANEL_NAMES.includes(name) ? name : "home";
  };

  // On a narrow screen the tabs scroll sideways, so slide the chosen one into view.
  function keepInView(tab) {
    const strip = tab.parentElement;
    const over = tab.offsetLeft + tab.offsetWidth + 8 - (strip.scrollLeft + strip.clientWidth);
    if (over > 0) strip.scrollLeft += over;
    else if (tab.offsetLeft - 8 < strip.scrollLeft) strip.scrollLeft = Math.max(0, tab.offsetLeft - 8);
  }

  function show(name) {
    if (shown !== "account" && name !== shown) before = shown;
    shown = name;
    for (const panel of panels) panel.hidden = panel.id !== "panel-" + name;
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) keepInView(tab);
    }
    // With the Account panel open no tab is chosen, so the first stays reachable by keyboard.
    if (!tabs.some((tab) => tab.tabIndex === 0)) tabs[0].tabIndex = 0;
    // If the page was scrolled down, bring the new panel's top back under the tab bar.
    const gap = $("panel-" + name).getBoundingClientRect().top - bar.getBoundingClientRect().height;
    if (gap < 0) window.scrollBy(0, gap - 16);
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => { location.hash = tab.dataset.tab; });
  }

  // The arrow keys move along the tabs, and Home and End jump to the ends.
  $("tab-collection").parentElement.addEventListener("keydown", (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const last = tabs.length - 1;
    const next = { ArrowRight: at === last ? 0 : at + 1, ArrowLeft: at === 0 ? last : at - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    tabs[next].focus();
    location.hash = tabs[next].dataset.tab;
  });

  window.addEventListener("hashchange", () => {
    show(fromAddress());
    // A link inside the panel that just hid would lose focus, so hand focus to the current tab.
    const active = document.activeElement;
    if (active === document.body || active.closest("[hidden]")) {
      tabs.find((tab) => tab.tabIndex === 0).focus({ preventScroll: true });
    }
  });
  show(fromAddress());
  return { back: () => before };
}

// ---------- Games page ----------

const HOME_HINT = "The games players have been adding to their libraries the most lately.";

// Give a card the slam-in animation, then take the class off again so that switching tabs
// doesn't replay it.
function slamIn(card, i = 0) {
  card.classList.add("enter");
  card.style.setProperty("--i", i);
  card.addEventListener("animationend", (e) => {
    if (e.target === card) card.classList.remove("enter");
  });
}

function initGames() {
  const list = $("games");
  const empty = $("games-empty");
  const addForm = $("add-form");
  const lookupForm = $("lookup-form");
  const resultsList = $("results");
  const lookupStatus = $("lookup-status");
  const wishList = $("wishlist");
  const wishEmpty = $("wishlist-empty");
  const trendList = $("trending");
  const trendEmpty = $("trending-empty");
  const nav = initTabs();
  let user = null; // the signed-in account { id, username, createdAt }, or null for a visitor
  let games = [];
  let wishlist = [];
  let trending = null; // stays null until the list has loaded
  let filter = "";
  let results = [];
  // Which cards have their Details dropdown open. The cards are redrawn whenever the list changes,
  // and an open one should not snap shut.
  const openGames = new Set();
  const openWishes = new Set();
  const openResults = new Set();
  const openTrending = new Set();
  const remember = (set, key) => (open) => (open ? set.add(key) : set.delete(key));

  // Details fetched for a saved game are saved with it, so they show at once next time.
  async function keepDetails(game, extra) {
    const fresh = {};
    for (const [key, value] of Object.entries(extra)) {
      if (game[key] === undefined) fresh[key] = value;
    }
    Object.assign(game, fresh);
    try {
      await api("/api/games/" + encodeURIComponent(game.id), { method: "PUT", body: fresh });
    } catch {
      // Not saved this time. The card fetches them again the next time it is opened.
    }
  }

  // A search or trending result is already in the collection when it has the same RAWG id or title.
  const owned = (result) => games.some((g) => sameGame(g, result));

  // The wishlist entry for a result, when it has one.
  const wishOf = (result) => wishlist.find((item) => sameGame(item, result));

  // Saving a game needs an account. A visitor is sent to the Account tab, which brings them back
  // to where they were once they have signed in.
  function askToSignIn(message) {
    toast(message);
    location.hash = "account";
  }

  // Tell the person why something failed. A 401 is left out: the page has already said that the
  // sign-in ended (see session-ended below).
  function fail(err) {
    if (err.status !== 401) toast(err.message, "error");
  }

  // The number on a tab pops when it changes, so an add is noticed from the other tabs.
  function setTabCount(badge, count) {
    const changed = badge.textContent !== String(count);
    badge.textContent = count;
    if (changed && badge.dataset.ready) {
      badge.classList.remove("bump");
      void badge.offsetWidth;
      badge.classList.add("bump");
    }
    badge.dataset.ready = "true";
  }

  // ---------- Collection ----------

  function gameCard(game) {
    const title = game.title || "Untitled game";
    const deleteButton = el("button", {
      class: "btn btn-danger btn-sm",
      type: "button",
      text: "Delete",
      "aria-label": "Delete " + title,
    });
    // Delete asks twice: the first click arms the button, the second one confirms.
    let disarm;
    deleteButton.addEventListener("click", () => {
      if (deleteButton.dataset.armed === "true") {
        clearTimeout(disarm);
        removeGame(game, deleteButton);
        return;
      }
      deleteButton.dataset.armed = "true";
      deleteButton.textContent = "Sure?";
      disarm = setTimeout(() => {
        deleteButton.dataset.armed = "false";
        deleteButton.textContent = "Delete";
      }, 4000);
    });

    return el("li", { class: "game", "data-id": game.id },
      cover(game),
      cardBody(game),
      el("div", { class: "actions" },
        el("a", {
          class: "btn btn-ghost btn-sm",
          href: "edit.html?id=" + encodeURIComponent(game.id),
          text: "Edit",
          "aria-label": "Edit " + title,
        }),
        deleteButton,
      ),
      detailsPanel(game, {
        isOpen: openGames.has(game.id),
        onToggle: remember(openGames, game.id),
        onLoaded: (extra) => keepDetails(game, extra),
      }),
    );
  }

  // Draw the collection. Pass true to slam the cards in one after another.
  function render(enter = false) {
    const q = filter.trim().toLowerCase();
    const shown = [...games]
      .sort((a, b) => b.id - a.id)
      .filter((g) => [
        g.title,
        platformNames(g).join(" "),
        platformTags(g).map((t) => t.title).join(" "),
        genresOf(g).join(" "),
        listOf(g.developers).join(" "),
        listOf(g.publishers).join(" "),
        yearOf(g),
      ].join(" ").toLowerCase().includes(q));

    $("count-num").textContent = games.length;
    $("count-label").textContent = games.length === 1 ? "game" : "games";
    setTabCount($("tab-count"), games.length);

    const cards = shown.map(gameCard);
    if (enter) cards.forEach((card, i) => slamIn(card, i));
    list.replaceChildren(...cards);

    if (shown.length) empty.hidden = true;
    else if (!user) fillEmpty(empty, { title: "Sign in to see your games", text: "Your collection is saved to your account.", links: SIGN_IN_LINKS });
    else if (games.length) fillEmpty(empty, { title: "No matches", text: "Nothing in your collection matches “" + filter.trim() + "”." });
    else fillEmpty(empty, {
      title: "Your collection is empty",
      text: "Search RAWG for a game, or add one yourself.",
      links: [{ text: "Look up online", href: "#lookup", primary: true }, { text: "Add a game", href: "#add" }],
    });
  }

  async function loadGames() {
    list.replaceChildren(...[0, 1, 2].map(() => el("li", { class: "skeleton" })));
    list.setAttribute("aria-busy", "true");
    empty.hidden = true;
    try {
      games = await api("/api/games");
      render(true);
      renderBrowse();
      renderAccount();
    } catch (err) {
      list.replaceChildren();
      if (err.status !== 401) fillEmpty(empty, { title: "Couldn't load your games", text: err.message, retry: loadGames });
    } finally {
      list.removeAttribute("aria-busy");
    }
  }

  async function removeGame(game, button) {
    button.disabled = true;
    try {
      await api("/api/games/" + encodeURIComponent(game.id), { method: "DELETE" });
      games = games.filter((g) => g.id !== game.id);
      renderAll();
      toast("Removed “" + (game.title || "Untitled game") + "”.");
    } catch (err) {
      button.disabled = false;
      fail(err);
    }
  }

  // Put a game in the collection and make just that card slam in. A game that was on the wishlist
  // is gone from it now, which the server has done as well.
  function collect(game, message = "Added “" + (game.title || "Untitled game") + "” to your collection.") {
    games = [...games.filter((g) => g.id !== game.id), game];
    wishlist = wishlist.filter((item) => !sameGame(item, game));
    renderAll();
    const card = list.querySelector('[data-id="' + game.id + '"]');
    if (card) slamIn(card);
    toast(message);
  }

  // ---------- Wishlist ----------

  function wishCard(item) {
    const title = item.title || "Untitled game";
    const moveButton = el("button", {
      class: "btn btn-primary btn-sm",
      type: "button",
      text: "Move to collection",
      "aria-label": "Move to your collection: " + title,
    });
    const removeButton = el("button", {
      class: "btn btn-ghost btn-sm",
      type: "button",
      text: "Remove",
      "aria-label": "Remove from your wishlist: " + title,
    });
    moveButton.addEventListener("click", () => moveWish(item, moveButton));
    removeButton.addEventListener("click", () => removeWish(item, removeButton));

    return el("li", { class: "game game-wish", "data-id": item.id },
      cover(item),
      cardBody(item),
      el("div", { class: "actions" }, moveButton, removeButton),
      detailsPanel(item, {
        isOpen: openWishes.has(item.id),
        onToggle: remember(openWishes, item.id),
      }),
    );
  }

  function renderWishlist(enter = false) {
    setTabCount($("wish-count"), wishlist.length);
    const cards = [...wishlist].sort((a, b) => b.id - a.id).map(wishCard);
    if (enter) cards.forEach((card, i) => slamIn(card, i));
    wishList.replaceChildren(...cards);

    if (cards.length) wishEmpty.hidden = true;
    else if (!user) fillEmpty(wishEmpty, { title: "Sign in to keep a wishlist", text: "Save the games you want to play next.", links: SIGN_IN_LINKS });
    else fillEmpty(wishEmpty, {
      title: "Your wishlist is empty",
      text: "Tap the heart on a game to save it for later.",
      links: [{ text: "See what's trending", href: "#home", primary: true }, { text: "Look up online", href: "#lookup" }],
    });
  }

  async function loadWishlist() {
    wishList.replaceChildren(...[0, 1].map(() => el("li", { class: "skeleton" })));
    wishList.setAttribute("aria-busy", "true");
    wishEmpty.hidden = true;
    try {
      wishlist = await api("/api/wishlist");
      renderWishlist(true);
      renderBrowse();
      renderAccount();
    } catch (err) {
      wishList.replaceChildren();
      if (err.status !== 401) fillEmpty(wishEmpty, { title: "Couldn't load your wishlist", text: err.message, retry: loadWishlist });
    } finally {
      wishList.removeAttribute("aria-busy");
    }
  }

  // Another tab may have changed things. Fetch both lists again, without the loading placeholders.
  async function resync() {
    try {
      [games, wishlist] = await Promise.all([api("/api/games"), api("/api/wishlist")]);
      renderAll();
    } catch {
      // Whatever went wrong has already been shown.
    }
  }

  function actionFailed(err, button) {
    setBusy(button, false);
    fail(err);
    if (err.status === 404 || err.status === 409) resync(); // another tab got there first
  }

  // Details that were already fetched for a result go along with it when it is saved.
  async function withFetched(result) {
    const extra = detailsCache.has(result.rawg_id) ? await detailsCache.get(result.rawg_id).catch(() => null) : null;
    return { ...result, ...extra };
  }

  // The heart on a result or a trending game: on the wishlist, or off it.
  async function toggleWish(result, button) {
    if (!user) return askToSignIn("Sign in to keep a wishlist.");
    const existing = wishOf(result);
    const restoreFocus = holdFocus(button);
    setBusy(button, true, existing ? "Removing" : "Saving");
    try {
      if (existing) {
        await api("/api/wishlist/" + encodeURIComponent(existing.id), { method: "DELETE" });
        wishlist = wishlist.filter((item) => item !== existing);
        toast("Removed “" + result.title + "” from your wishlist.");
      } else {
        wishlist.push(await api("/api/wishlist", { method: "POST", body: await withFetched(result) }));
        toast("Added “" + result.title + "” to your wishlist.");
      }
      renderAll();
      restoreFocus();
    } catch (err) {
      actionFailed(err, button);
    }
  }

  // Got the game: it leaves the wishlist and joins the collection.
  async function moveWish(item, button) {
    setBusy(button, true, "Moving");
    try {
      const game = await api("/api/wishlist/" + encodeURIComponent(item.id) + "/collect", { method: "POST" });
      collect(game, "Moved “" + (game.title || "Untitled game") + "” to your collection.");
    } catch (err) {
      actionFailed(err, button);
    }
  }

  async function removeWish(item, button) {
    setBusy(button, true, "Removing");
    try {
      await api("/api/wishlist/" + encodeURIComponent(item.id), { method: "DELETE" });
      wishlist = wishlist.filter((w) => w !== item);
      renderAll();
      toast("Removed “" + (item.title || "Untitled game") + "” from your wishlist.");
    } catch (err) {
      actionFailed(err, button);
    }
  }

  // ---------- Search results and trending ----------

  // The buttons under a search result or a trending game: keep it, or save it for later.
  function saveActions(result) {
    const have = owned(result);
    const wished = Boolean(wishOf(result));

    const keep = el("button", {
      class: "btn btn-primary btn-sm",
      type: "button",
      text: have ? "In collection" : "Add to collection",
      "aria-label": (have ? "Already in your collection: " : "Add to your collection: ") + result.title,
    });
    keep.disabled = have;
    if (!have) keep.addEventListener("click", () => addResult(result, keep));

    // A game that is already owned has no use for the heart.
    let heart = null;
    if (!have) {
      heart = el("button", {
        class: "btn btn-ghost btn-sm btn-wish" + (wished ? " is-on" : ""),
        type: "button",
        "aria-pressed": String(wished),
        "aria-label": (wished ? "Remove from your wishlist: " : "Add to your wishlist: ") + result.title,
      },
        icon(wished ? "heart-solid" : "heart"),
        el("span", { text: wished ? "On wishlist" : "Wishlist" }),
      );
      heart.addEventListener("click", () => toggleWish(result, heart));
    }
    return el("div", { class: "save-actions" }, keep, heart);
  }

  // One search result: its art, what it is, the systems it is on, and the buttons to keep it.
  function resultRow(result) {
    const rating = ratingOf(result);
    const facts = [yearOf(result), rating && rating.toFixed(1) + " / 5"].filter(Boolean).join(" · ");
    return el("li", { class: "result" },
      cover(result, "sm"),
      el("div", { class: "result-body" },
        el("p", { class: "result-title", text: result.title }),
        facts ? el("p", { class: "result-meta", text: facts }) : null,
        el("p", { class: "tags" }, ...platformTags(result).map(platformChip)),
        saveActions(result),
      ),
      // Have a look at the developer and publisher before deciding to keep it.
      detailsPanel(result, {
        isOpen: openResults.has(result.rawg_id),
        onToggle: remember(openResults, result.rawg_id),
      }),
    );
  }

  function renderResults() {
    resultsList.replaceChildren(...results.map(resultRow));
  }

  // One game in the trending list: big art with its rank on the corner, then the same chips and
  // buttons a search result has.
  function trendCard(result, rank) {
    const body = cardBody(result, "trend-body");
    body.append(saveActions(result));
    return el("li", { class: "trend" },
      el("div", { class: "trend-art" },
        cover(result, "lg"),
        el("span", { class: "rank", "aria-hidden": "true", text: "#" + rank }), // the list is numbered already
      ),
      body,
      detailsPanel(result, {
        isOpen: openTrending.has(result.rawg_id),
        onToggle: remember(openTrending, result.rawg_id),
      }),
    );
  }

  function renderTrending(enter = false) {
    if (!trending) return; // still loading: leave the placeholders alone
    const cards = trending.map((game, i) => trendCard(game, i + 1));
    if (enter) cards.forEach((card, i) => slamIn(card, i));
    trendList.replaceChildren(...cards);
  }

  // Search results and trending games both show whether a game is owned or wished for. When that
  // changes only their buttons are redrawn, so a click doesn't make the rest of the cards blink.
  function refreshButtons(container, items) {
    [...container.children].forEach((card, i) => {
      const old = card.querySelector(".save-actions");
      if (old && items[i]) old.replaceWith(saveActions(items[i]));
    });
  }

  // A button is disabled while its request runs, and then redrawn, which drops the keyboard focus.
  // Note where the focus was, and give back the function that puts it back once the card's buttons
  // are redrawn. If the button it was on is gone, the card's Details bar gets it.
  function holdFocus(button) {
    if (document.activeElement !== button) return () => {};
    const card = button.closest("li");
    const at = [...button.parentElement.children].indexOf(button);
    return () => {
      const target = card.querySelector(".save-actions")?.children[at];
      (target && !target.disabled ? target : card.querySelector("summary"))?.focus();
    };
  }

  function renderBrowse() {
    refreshButtons(resultsList, results);
    refreshButtons(trendList, trending || []);
  }

  async function loadTrending() {
    trending = null;
    trendList.replaceChildren(...[0, 1, 2, 3].map(() => el("li", { class: "skeleton" })));
    trendList.setAttribute("aria-busy", "true");
    trendEmpty.hidden = true;
    try {
      trending = await api("/api/trending");
      renderTrending(true);
      if (!trending.length) fillEmpty(trendEmpty, { title: "Nothing is trending", text: "RAWG has no recent games to show right now. Check back soon." });
    } catch (err) {
      trendList.replaceChildren();
      fillEmpty(trendEmpty, { title: "Couldn't load trending games", text: err.message, retry: loadTrending });
    } finally {
      trendList.removeAttribute("aria-busy");
    }
  }

  // The backend keeps whatever it is sent, so a search result is saved exactly as it came back.
  // If its details were already opened they go along with it.
  async function addResult(result, button) {
    if (!user) return askToSignIn("Sign in to add games to your collection.");
    const restoreFocus = holdFocus(button);
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", { method: "POST", body: await withFetched(result) }));
      restoreFocus();
    } catch (err) {
      actionFailed(err, button);
    }
  }

  // ---------- Account ----------

  const forms = { signin: $("signin-form"), signup: $("signup-form") };

  // The Account tab shows one of its two forms. Links that lead there say which one they want.
  function showMode(mode) {
    for (const [name, form] of Object.entries(forms)) {
      form.hidden = name !== mode;
      $("seg-" + name).setAttribute("aria-pressed", String(name === mode));
    }
  }

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-mode]");
    if (toggle) showMode(toggle.dataset.mode);
  });

  function renderAccount() {
    $("member-name").textContent = user ? user.username : "";
    $("member-games").textContent = games.length;
    $("member-wishes").textContent = wishlist.length;
    $("member-since").textContent = (user && formatDate(user.createdAt)) || "-";
  }

  // Everything that depends on who is signed in: the button in the masthead, which forms and
  // lists are on show, and the person's own collection and wishlist, which are fetched
  // afresh. A visitor gets signed-out versions of them.
  function applyUser() {
    games = [];
    wishlist = [];

    $("account-name").textContent = user ? user.username : "Sign in";
    $("account-link").setAttribute("aria-label", user ? "Your account: " + user.username : "Sign in or create an account");
    $("account-link").hidden = false;
    $("stat").hidden = !user;
    $("account-guest").hidden = Boolean(user);
    $("account-member").hidden = !user;
    $("filter").closest(".search").hidden = !user;
    $("home-hint").textContent = HOME_HINT + (user ? "" : " Sign in to save any of them.");

    addForm.hidden = !user;
    $("add-hint").hidden = !user;
    if (user) $("add-empty").hidden = true;
    else fillEmpty($("add-empty"), { title: "Sign in to add games", text: "Games you add are saved to your account.", links: SIGN_IN_LINKS });

    // Drawn first for both kinds of visitor. For a signed-in person the loading placeholders
    // replace it straight away, before the browser paints.
    renderAll();
    if (user) {
      loadGames();
      loadWishlist();
    } else {
      list.removeAttribute("aria-busy");
      wishList.removeAttribute("aria-busy");
    }
  }

  // Sign in or create an account, then go back to the tab the person came from.
  async function enter(form, path, body, busyLabel, welcome) {
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, busyLabel);
    try {
      user = (await api(path, { method: "POST", body })).user;
      form.reset();
      applyUser();
      toast(welcome(user));
      location.hash = nav.back();
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      setBusy(button, false);
    }
  }

  forms.signin.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFormError(forms.signin);
    const username = forms.signin.elements.username.value.trim();
    const password = forms.signin.elements.password.value;
    if (!username) return showFormError(forms.signin, "Type your username.", "username");
    if (!password) return showFormError(forms.signin, "Type your password.", "password");
    enter(forms.signin, "/api/auth/login", { username, password }, "Signing in", (me) => "Welcome back, " + me.username + ".");
  });

  forms.signup.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFormError(forms.signup);
    const { username, password, confirm: again } = forms.signup.elements;
    const name = username.value.trim();
    if (!USERNAME.test(name)) {
      return showFormError(forms.signup, "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.", "username");
    }
    if (password.value.length < 8) return showFormError(forms.signup, "Use at least 8 characters for the password.", "password");
    if (password.value !== again.value) return showFormError(forms.signup, "The two passwords don't match.", "confirm");
    enter(forms.signup, "/api/auth/register", { username: name, password: password.value }, "Creating", (me) => "Welcome to MyGameVault, " + me.username + ".");
  });

  $("signout").addEventListener("click", async (e) => {
    const button = e.currentTarget;
    setBusy(button, true, "Signing out");
    try {
      await api("/api/auth/logout", { method: "POST" });
      user = null;
      applyUser();
      location.hash = "home";
      toast("Signed out.");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(button, false);
    }
  });

  // A sign-in can run out while the page is open (api() says so on a 401). The page then falls
  // back to its signed-out self.
  window.addEventListener("session-ended", () => {
    if (!user) return;
    user = null;
    applyUser();
    toast("Your sign-in ended. Sign in again to carry on.", "error");
  });

  // ---------- Everything else ----------

  function renderAll() {
    render();
    renderWishlist();
    renderBrowse();
    renderAccount();
  }

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(addForm);
    const check = readForm(addForm);
    if (check.error) return showFormError(addForm, check.error, check.field);
    const { title, platformIds, rating, year, developers, publishers } = check.values;
    const body = { title, platforms: platformIds.map((id) => platformById(id).name) };
    if (rating != null) body.rating = rating;
    if (year != null) body.released = String(year);
    if (developers.length) body.developers = developers;
    if (publishers.length) body.publishers = publishers;

    const button = addForm.querySelector("button[type=submit]");
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", { method: "POST", body }));
      // Keep the platforms: people usually add several games for the same system in a row.
      addForm.reset();
      checkPlatforms(addForm, platformIds);
      addForm.elements.title.focus();
    } catch (err) {
      showFormError(addForm, err.message);
    } finally {
      setBusy(button, false);
    }
  });

  lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(lookupForm);
    const title = lookupForm.elements.search.value.trim();
    if (!title) return showFormError(lookupForm, "Type a title to search for.", "search");
    const button = lookupForm.querySelector("button[type=submit]");
    setBusy(button, true, "Searching");
    lookupStatus.textContent = "";
    try {
      results = await api("/api/lookup?title=" + encodeURIComponent(title));
      if (!results.length) lookupStatus.textContent = "No games found on RAWG for “" + title + "”.";
    } catch (err) {
      results = [];
      showFormError(lookupForm, err.message);
    } finally {
      renderResults();
      setBusy(button, false);
    }
  });

  $("filter").addEventListener("input", (e) => {
    filter = e.target.value;
    render();
  });

  buildPicker(addForm);
  watchForm(addForm);
  watchForm(lookupForm);
  watchForm(forms.signin);
  watchForm(forms.signup);

  const flash = takeFlash();
  if (flash) toast(flash);

  // The trending list is for everyone, so it loads while the page finds out who is signed in.
  // If the server can't be asked, the page carries on as a visitor's.
  loadTrending();
  api("/api/auth/me")
    .then((me) => { user = me.user; })
    .catch(() => { user = null; })
    .then(applyUser);
}

// ---------- Edit page ----------

// A game's platform names after its tiles were changed. Names for systems that are still ticked
// stay as they were ("PlayStation 5" stays "PlayStation 5"), unticked ones go, names we don't
// recognise are left alone, and newly ticked systems get their tile's name.
function platformsAfterEdit(game, ids) {
  const names = platformNames(game);
  const keep = names.filter((name) => {
    const known = platformFor(name);
    return !known || ids.includes(known.id);
  });
  const had = new Set(names.map((name) => (platformFor(name) || {}).id));
  const added = ids.filter((id) => !had.has(id)).map((id) => platformById(id).name);
  return [...keep, ...added];
}

function initEdit() {
  const id = new URLSearchParams(location.search).get("id");
  const form = $("edit-form");
  const state = $("edit-state");
  let original;

  function showState(title, text, links) {
    fillEmpty(state, { title, text, links });
    form.hidden = true;
  }

  async function loadGame() {
    if (!id) return showState("No game chosen", "Pick a game from your collection and press Edit.");
    try {
      const games = await api("/api/games");
      original = games.find((g) => String(g.id) === id);
      if (!original) return showState("Game not found", "It may have been deleted from your collection.");
      const title = original.title || "Untitled game";
      buildPicker(form, knownPlatformIds(original));
      form.elements.title.value = original.title || "";
      form.elements.rating.value = ratingOf(original) ?? "";
      form.elements.year.value = yearOf(original) ?? "";
      form.elements.developer.value = listOf(original.developers).join(", ");
      form.elements.publisher.value = listOf(original.publishers).join(", ");
      $("edit-name").textContent = title;
      document.title = "Edit " + title + " · MyGameVault";
      state.hidden = true;
      form.hidden = false;
      form.elements.title.focus();
    } catch (err) {
      if (err.status === 401) {
        return showState("Sign in to edit your games", "Your collection is saved to your account.", [
          { text: "Sign in", href: "index.html#account", primary: true },
        ]);
      }
      showState("Couldn't load this game", err.message);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(form);
    const check = readForm(form);
    if (check.error) return showFormError(form, check.error, check.field);
    const { title, platformIds, rating, year, developers, publishers } = check.values;

    // Send only what changed. The backend merges it into the saved game, so the RAWG id, the
    // picture, the genres and the full release date are never lost by editing the title.
    const changes = { title };
    const before = knownPlatformIds(original);
    const sameSystems = before.length === platformIds.length && platformIds.every((pid) => before.includes(pid));
    if (!sameSystems) changes.platforms = platformsAfterEdit(original, platformIds);
    if (rating !== ratingOf(original)) changes.rating = rating;
    if (year !== yearOf(original)) changes.released = year == null ? null : String(year);
    // An empty box for a game that never had a developer is not a change, and leaving it out lets
    // the Details dropdown still fetch the real one from RAWG.
    const sameNames = (a, b) => a.length === b.length && a.every((name, i) => name === b[i]);
    if (!sameNames(developers, listOf(original.developers))) changes.developers = developers;
    if (!sameNames(publishers, listOf(original.publishers))) changes.publishers = publishers;

    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Saving");
    try {
      const game = await api("/api/games/" + encodeURIComponent(id), { method: "PUT", body: changes });
      setFlash("Saved changes to “" + (game.title || "Untitled game") + "”.");
      window.location.href = "index.html#collection";
    } catch (err) {
      setBusy(button, false);
      showFormError(form, err.message);
    }
  });

  watchForm(form);
  loadGame();
}

const pages = { games: initGames, edit: initEdit };
pages[document.body.dataset.page]?.();
