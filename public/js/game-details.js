// Cache game details requests by RAWG ID to deduplicate API calls
const detailsCache = new Map();

const DETAIL_KEYS = ["developers", "publishers", "website", "esrb", "metacritic", "playtime"];
const pickDetails = (extra) => Object.fromEntries(DETAIL_KEYS.map((key) => [key, extra?.[key] ?? null]));

function fetchDetails(rawgId) {
  if (!detailsCache.has(rawgId)) {
    const request = api("/api/lookup/" + encodeURIComponent(rawgId)).then(pickDetails);
    request.catch(() => detailsCache.delete(rawgId));
    detailsCache.set(rawgId, request);
  }
  return detailsCache.get(rawgId);
}

const listOf = (value) =>
  (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);

// Presence of esrb indicates whether full details were previously fetched
const detailsFetched = (game) => game.esrb !== undefined;

function withDetails(game, extra) {
  const merged = { ...game };
  for (const [key, value] of Object.entries(extra || {})) {
    if (merged[key] === undefined) merged[key] = value;
  }
  return merged;
}

const distinct = (names) =>
  names.filter((name, i) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === i);

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

function fullPlatformChip(name) {
  const platform = platformFor(name) || platformById("other");
  return el("span", { class: "chip chip-platform chip-full", title: name },
    icon(platform.id),
    el("span", { text: name }),
  );
}

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

  const reasonFor = (err) =>
    /\(404\)/.test(err.message) ? "This server may need updating. Restart it with the latest code." : err.message;

  async function fill() {
    if (!game.rawg_id || detailsFetched(game)) {
      body.replaceChildren(detailList(game));
      if (!game.rawg_id && !listOf(game.developers).length && !listOf(game.publishers).length) {
        body.append(el("p", { class: "more-note", text: "Added by hand. Edit the game to fill in a developer and publisher." }));
      }
      return;
    }

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

