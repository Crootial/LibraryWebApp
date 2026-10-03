// The Details dropdown on a card: fetching the extra RAWG facts and drawing them.

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

