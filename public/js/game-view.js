function platformNames(game) {
  const list = Array.isArray(game.platforms) ? game.platforms : [game.platforms];
  return list.flatMap((entry) => String(entry ?? "").split(",")).map((name) => name.trim()).filter(Boolean);
}

// One tag per console family (PS4 and PS5 are both PlayStation); unknown platforms keep their own name
function platformTags(game) {
  const seen = new Set();
  return platformNames(game).flatMap((name) => {
    const known = platformFor(name);
    const key = known ? known.id : "other:" + name.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [known ? { platform: known, label: known.abbr, title: known.name } : { platform: platformById("other"), label: name, title: name }];
  });
}

function ratingOf(game) {
  const n = parseFloat(game.rating);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function yearOf(game) {
  const match = /^\d{4}/.exec(String(game.released ?? "").trim());
  return match ? Number(match[0]) : null;
}

const genresOf = (game) => (Array.isArray(game.genres) ? game.genres.filter((g) => typeof g === "string" && g) : []);
const imageOf = (game) => (typeof game.image === "string" && /^https?:\/\//i.test(game.image) ? game.image : null);
const titleKey = (game) => String(game.title ?? "").trim().toLowerCase();
const sameGame = (a, b) => Boolean((a.rawg_id && a.rawg_id === b.rawg_id) || (titleKey(a) && titleKey(a) === titleKey(b)));

// Ask RAWG's image server for a smaller copy
const artUrl = (url) =>
  url.startsWith("https://media.rawg.io/media/") && !url.includes("/media/crop/") ? url.replace("/media/", "/media/crop/600/400/") : url;

// A click, Enter or Space on a cover or title opens the game's details page
function opensDetails(node, game) {
  const open = (e) => {
    e.stopPropagation();
    if (typeof openGameDetail === "function") openGameDetail(game);
  };
  node.addEventListener("click", open);
  node.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    open(e);
  });
  return node;
}

const gameTitle = (tag, className, game) => opensDetails(el(tag, {
  class: className + " clickable-title",
  text: game.title || "Untitled game",
  role: "button",
  tabindex: "0",
  "aria-label": "View details for " + (game.title || "game"),
}), game);

// The cover art, or a tile with the console's icon in its brand colour when there is none
function cover(game, size = "") {
  const platform = platformTags(game)[0]?.platform || platformById("other");
  const tile = el("div", {
    class: "cover" + (size ? " cover-" + size : "") + " cover-clickable",
    "data-brand": platform.brand,
    role: "button",
    tabindex: "0",
    "aria-label": "View details for " + (game.title || "game"),
  }, icon(platform.id));
  const image = imageOf(game);
  if (image) {
    // The full-size image when the smaller copy fails, and the console tile when both do
    const art = el("img", { src: artUrl(image), alt: "", loading: "lazy", decoding: "async" });
    art.addEventListener("error", () => (art.src !== image ? (art.src = image) : art.remove()));
    tile.append(art);
  }
  return opensDetails(tile, game);
}

const platformChip = (tag) =>
  el("span", { class: "chip chip-platform", title: tag.title }, icon(tag.platform.id), el("span", { text: tag.label }));

const ratingChip = (rating) =>
  el("span", { class: "chip chip-rating", title: "Rating out of 5" }, icon("star"), el("span", { text: rating.toFixed(1) }));

function cardBody(game, className = "game-body") {
  const rating = ratingOf(game);
  const year = yearOf(game);
  const genres = genresOf(game);
  return el("div", { class: className },
    gameTitle("h3", "game-title", game),
    genres.length ? el("p", { class: "game-meta", text: genres.slice(0, 3).join(" · ") }) : null,
    el("p", { class: "tags" },
      rating ? ratingChip(rating) : null,
      year ? el("span", { class: "chip", text: year }) : null,
      ...platformTags(game).map(platformChip),
    ),
  );
}

// Fills an empty-state box: a heading, a sentence, an optional Try again button and links
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

const SIGN_IN_LINKS = [
  { text: "Sign in", href: "#account", primary: true, mode: "signin" },
  { text: "Create account", href: "#account", mode: "signup" },
];
