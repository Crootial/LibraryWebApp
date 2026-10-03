// Reading a game: names, ratings and years, plus the pieces a card is built from.
//
// The API stores a game as { id, title, platforms: [names], rating, released, image, genres, rawg_id }.
// Games added by hand carry fewer of those, so every reader below copes with missing fields.
// A collection, a wishlist, search results and the trending list all hold games in that shape.
// The collection and the wishlist belong to the signed-in account; search and trending are open to all.

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

