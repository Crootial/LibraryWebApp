// RAWG details for a game, fetched once per RAWG id and shared by every card that asks
const detailsCache = new Map();
const DETAIL_KEYS = ["developers", "publishers", "website", "esrb", "metacritic", "playtime"];

function fetchDetails(rawgId) {
  if (!detailsCache.has(rawgId)) {
    const request = api("/api/lookup/" + encodeURIComponent(rawgId))
      .then((extra) => Object.fromEntries(DETAIL_KEYS.map((key) => [key, extra?.[key] ?? null])));
    request.catch(() => detailsCache.delete(rawgId));
    detailsCache.set(rawgId, request);
  }
  return detailsCache.get(rawgId);
}

const listOf = (value) =>
  (Array.isArray(value) ? value : String(value ?? "").split(",")).map((name) => String(name ?? "").trim()).filter(Boolean);

// A saved game keeps its RAWG details once they have been fetched; esrb is always among them
const detailsFetched = (game) => game.esrb !== undefined;

const withDetails = (game, extra) =>
  ({ ...game, ...Object.fromEntries(Object.entries(extra || {}).filter(([key]) => game[key] === undefined)) });

const distinct = (names) => names.filter((name, i) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === i);

// "May 18, 2015" style dates (month "long" or "short"), just the year when that is all there is, or null
function formatDate(released, month = "long") {
  const text = String(released ?? "").trim();
  const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const date = full && new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
  if (date && !Number.isNaN(date.getTime())) return date.toLocaleDateString(undefined, { year: "numeric", month, day: "numeric" });
  const year = yearOf({ released: text });
  return year ? String(year) : null;
}

function websiteLink(url) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  return el("a", { class: "text-link", href: url, target: "_blank", rel: "noopener noreferrer", text: host });
}

const detailItem = (label, content, wide = false) =>
  el("div", { class: wide ? "detail detail-wide" : "detail" }, el("dt", { text: label }), el("dd", {}, ...[].concat(content)));

function fullPlatformChip(name) {
  const platform = platformFor(name) || platformById("other");
  return el("span", { class: "chip chip-platform chip-full", title: name }, icon(platform.id), el("span", { text: name }));
}

function detailList(info, { credits = true } = {}) {
  const rating = ratingOf(info);
  const platforms = distinct(platformNames(info));
  const site = websiteLink(info.website);
  const group = (...items) => el("dl", { class: "detail-list" }, ...items);
  return el("div", { class: "detail-groups" },
    group(
      detailItem("Release Date", formatDate(info.released) || "N/A"),
      detailItem("Genres", genresOf(info).join(" · ") || "N/A"),
      info.esrb ? detailItem("Age rating", info.esrb) : null,
      info.metacritic ? detailItem("Metacritic", String(info.metacritic)) : null,
      rating ? detailItem("Rating", rating.toFixed(1) + " / 5") : null,
      info.playtime ? detailItem("Average playtime", info.playtime + " hours") : null,
    ),
    credits ? group(
      detailItem("Developer", listOf(info.developers).join(" · ") || "N/A"),
      detailItem("Publisher", listOf(info.publishers).join(" · ") || "N/A"),
    ) : null,
    group(
      detailItem("Platforms", platforms.length ? el("span", { class: "detail-chips" }, ...platforms.map(fullPlatformChip)) : "N/A", true),
      site ? detailItem("Website", site, true) : null,
    ),
  );
}

// The Show Details dropdown at the foot of a card: a real <details>, built the first time it opens.
//   isOpen   - start open (the lists are redrawn often, and an open card should stay open)
//   onToggle - told when it opens or closes
//   onLoaded - given the details fetched from RAWG, so a saved game can keep them
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

  async function fill() {
    if (!game.rawg_id || detailsFetched(game)) {
      body.replaceChildren(detailList(game));
      if (!game.rawg_id && !listOf(game.developers).length && !listOf(game.publishers).length) {
        body.append(el("p", { class: "more-note", text: "Added by hand. Edit the game to fill in a developer and publisher." }));
      }
      return;
    }
    const basics = () => detailList(game, { credits: game.developers !== undefined || game.publishers !== undefined });
    body.replaceChildren(basics(), el("p", { class: "more-status loading", role: "status", text: "Loading developer, publisher and more" }));
    try {
      const extra = await fetchDetails(game.rawg_id);
      onLoaded?.(extra);
      body.replaceChildren(detailList(withDetails(game, extra)));
    } catch (err) {
      const reason = /\(404\)/.test(err.message) ? "This server may need updating. Restart it with the latest code." : err.message;
      body.replaceChildren(
        basics(),
        el("p", { class: "more-status", role: "alert", text: "Developer, publisher and more couldn't be loaded. " + reason }),
        el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Try again", onclick: fill }),
      );
    }
  }

  let filled = false;
  const build = () => {
    if (!filled) fill();
    filled = true;
  };
  more.addEventListener("toggle", () => {
    onToggle?.(more.open);
    if (more.open) build();
  });
  if (isOpen) {
    more.open = true;
    build();
  }
  return more;
}
