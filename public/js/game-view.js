function platformNames(game) {
  const list = Array.isArray(game.platforms) ? game.platforms : [game.platforms];
  return list.flatMap((entry) => String(entry ?? "").split(",")).map((name) => name.trim()).filter(Boolean);
}

// Map platforms to recognized groups (e.g. PS4/PS5 -> PlayStation) or fallback tags
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

function ratingOf(game) {
  const n = parseFloat(game.rating);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function yearOf(game) {
  const match = /^\d{4}/.exec(String(game.released ?? "").trim());
  return match ? Number(match[0]) : null;
}

const genresOf = (game) =>
  Array.isArray(game.genres) ? game.genres.filter((g) => typeof g === "string" && g) : [];

const imageOf = (game) =>
  typeof game.image === "string" && /^https?:\/\//i.test(game.image) ? game.image : null;

const titleKey = (game) => String(game.title ?? "").trim().toLowerCase();

const sameGame = (a, b) =>
  Boolean((a.rawg_id && a.rawg_id === b.rawg_id) || (titleKey(a) && titleKey(a) === titleKey(b)));

// Request resized image from RAWG media CDN
const artUrl = (url) =>
  url.startsWith("https://media.rawg.io/media/") && !url.includes("/media/crop/")
    ? url.replace("/media/", "/media/crop/600/400/")
    : url;

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
      if (art.src !== image) art.src = image; // Fallback to original image if resized version fails
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

