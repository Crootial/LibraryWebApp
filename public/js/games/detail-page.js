// The game details page, #game:rawg-123 (a RAWG game), #game:id-5 (a saved game) or #game:<title>:
// about, details, system requirements, the forum, screenshots and where to buy.
const detail = { game: null, rawg: null, shot: 0, aboutOpen: false };
const ABOUT_LENGTH = 380;
const TAB_LABELS = { home: "Home", collection: "My games", wishlist: "Wishlist", lookup: "Look up online", add: "Add a game", account: "Profile" };
// Shown for PC games when RAWG lists no requirements: typical values, not the game's own
const TYPICAL_PC = [
  "OS: Windows 10/11 (64-bit)\nProcessor: Intel Core i5-2500K / AMD FX-6300\nMemory: 8 GB RAM\nGraphics: NVIDIA GeForce GTX 770 / AMD Radeon R9 280\nStorage: 50 GB available space",
  "OS: Windows 10/11 (64-bit)\nProcessor: Intel Core i7-6700K / AMD Ryzen 5 1600\nMemory: 16 GB RAM\nGraphics: NVIDIA GeForce GTX 1060 / AMD Radeon RX 580\nStorage: 50 GB available space (SSD)",
];

const hashIdFor = (game) =>
  game.rawg_id ? "rawg-" + game.rawg_id : game.id ? "id-" + game.id : encodeURIComponent(game.title || "game");
const shortDate = (released) => formatDate(released, "short") || "N/A";
const backTo = () => {
  const previous = store.back() || "home";
  return previous === "game" ? "home" : previous;
};

function showGame(game) {
  Object.assign(detail, { game, rawg: null, shot: 0, aboutOpen: false });
}

function openGameDetail(game) {
  showGame(game);
  location.hash = "game:" + hashIdFor(game);
  renderGameDetailView();
}

// RAWG's full details; if they can't be loaded the page makes do with what the card had
async function loadGameDetails(game) {
  const data = await api("/api/lookup/" + encodeURIComponent(game.rawg_id)).catch(() => game);
  if (detail.game !== game) return; // the player has moved on to another game
  detail.rawg = data;
  renderGameDetailView();
}

// The game the address names, from the lists already loaded
function findGameFromHash(hash) {
  const id = hash.slice(1).split(/[:?&]/)[1] || "";
  if (!id) return detail.game;
  const known = [...store.games, ...store.wishlist, ...(store.trending || []), ...store.results];
  const rawgId = Number(id.startsWith("rawg-") ? id.slice(5) : /^\d+$/.test(id) ? id : NaN);
  if (rawgId) return known.find((g) => Number(g.rawg_id) === rawgId) || { rawg_id: rawgId, title: "Loading game..." };
  const saved = id.startsWith("id-") && known.find((g) => String(g.id) === id.slice(3));
  const title = decodeURIComponent(id).toLowerCase();
  return saved || known.find((g) => (g.title || "").toLowerCase() === title) || detail.game;
}

// ---------- Screenshots: the gallery and the full-screen viewer ----------

const lightbox = () => $("detail-lightbox-modal");
const closeLightbox = () => lightbox()?.classList.remove("is-open");

// Shows screenshot i in the gallery, and in the full-screen viewer when it is open
function showShot(shots, i) {
  detail.shot = (i + shots.length) % shots.length;
  const main = $("detail-main-img");
  if (main) main.src = artUrl(shots[detail.shot]);
  const counter = $("detail-gallery-counter");
  if (counter) counter.textContent = detail.shot + 1 + " / " + shots.length;
  document.querySelectorAll(".thumb-btn").forEach((thumb, n) => thumb.classList.toggle("is-selected", n === detail.shot));
  const box = lightbox();
  if (!box?.classList.contains("is-open")) return;
  box.querySelector(".lightbox-img").src = shots[detail.shot] || "";
  box.querySelector(".lightbox-footer").textContent = shots.length > 1 ? "Screenshot " + (detail.shot + 1) + " of " + shots.length : "Screenshot";
}

const navButton = (kind, step, shots) => el("button", {
  class: kind + "-nav-btn " + (step < 0 ? "prev" : "next"),
  type: "button",
  "aria-label": (step < 0 ? "Previous" : "Next") + " screenshot",
  onclick: (e) => {
    e.stopPropagation();
    showShot(shots, detail.shot + step);
  },
}, icon(step < 0 ? "chevron-left" : "chevron-right"));

function openLightbox(shots, title) {
  let box = lightbox();
  if (!box) {
    box = el("div", { id: "detail-lightbox-modal", class: "lightbox-modal", role: "dialog", "aria-modal": "true", "aria-label": "Screenshot viewer", onclick: closeLightbox });
    document.body.append(box);
  }
  const many = shots.length > 1;
  box.replaceChildren(
    el("button", { class: "lightbox-close-btn", type: "button", "aria-label": "Close screenshot view", onclick: closeLightbox }, icon("cross")),
    el("div", { class: "lightbox-content-wrap", onclick: (e) => e.stopPropagation() },
      many ? navButton("lightbox", -1, shots) : null,
      el("img", { class: "lightbox-img", alt: title + " screenshot" }),
      many ? navButton("lightbox", 1, shots) : null,
    ),
    el("div", { class: "lightbox-footer" }),
  );
  box.classList.add("is-open");
  showShot(shots, detail.shot);
}

// Escape and the arrow keys work the viewer while it is open; otherwise Escape leaves the details page
window.addEventListener("keydown", (e) => {
  const box = lightbox();
  if (box?.classList.contains("is-open")) {
    const button = { Escape: ".lightbox-close-btn", ArrowLeft: ".prev", ArrowRight: ".next" }[e.key];
    if (!button) return;
    e.preventDefault();
    box.querySelector(button)?.click();
  } else if (e.key === "Escape" && location.hash.startsWith("#game")) {
    location.hash = backTo();
  }
});

function galleryCard(shots, title) {
  const many = shots.length > 1;
  const open = () => openLightbox(shots, title);
  return el("div", { class: "detail-card detail-gallery-card" },
    el("h3", { class: "detail-card-title", text: "Screenshots & Media" }),
    el("div", {
      class: "gallery-main-viewer",
      role: "button",
      tabindex: "0",
      "aria-label": "Click to view full-size screenshot",
      onclick: open,
      onkeydown: (e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        open();
      },
    },
      el("img", { id: "detail-main-img", class: "gallery-featured-img", src: artUrl(shots[detail.shot] || shots[0]), alt: title + " screenshot" }),
      many ? navButton("gallery", -1, shots) : null,
      many ? navButton("gallery", 1, shots) : null,
      many ? el("span", { id: "detail-gallery-counter", class: "gallery-counter-badge", text: detail.shot + 1 + " / " + shots.length }) : null,
      el("span", { class: "gallery-expand-hint" }, icon("maximize"), el("span", { text: "Enlarge" })),
    ),
    many ? el("div", { class: "gallery-thumbs-grid" }, ...shots.slice(0, 8).map((shot, i) => el("button", {
      class: "thumb-btn" + (i === detail.shot ? " is-selected" : ""),
      type: "button",
      "aria-label": "Switch to screenshot " + (i + 1),
      onclick: () => showShot(shots, i),
    }, el("img", { src: artUrl(shot), alt: "Thumbnail " + (i + 1) })))) : null,
  );
}

// ---------- The page ----------

const card = (title, ...content) => el("div", { class: "detail-card" }, el("h3", { class: "detail-card-title", text: title }), ...content);
const row = (label, dd, wide = false) => el("div", { class: "dt-item" + (wide ? " dt-item-wide" : "") }, el("dt", { text: label }), dd);
const chipList = (list, className, props = {}) => el("dd", props, ...list.map((text) => el("span", { class: "chip " + className, text })));

function aboutCard(description) {
  if (!description) return null;
  const long = description.length > ABOUT_LENGTH;
  const text = () => (!long || detail.aboutOpen ? description : description.slice(0, ABOUT_LENGTH) + "...");
  const prose = el("p", { class: "detail-prose", text: text() });
  const toggle = el("button", { class: "btn btn-ghost btn-sm read-more-btn", type: "button", onclick: () => {
    detail.aboutOpen = !detail.aboutOpen;
    prose.textContent = text();
    toggle.firstChild.textContent = detail.aboutOpen ? "Read less" : "Read more";
  } }, el("span", { text: detail.aboutOpen ? "Read less" : "Read more" }));
  return card("About this game", el("div", { class: "detail-about-body" }, prose, long ? toggle : null));
}

function requirementsCard(rawgPlatforms, platforms) {
  const block = (name, minimum, recommended) => el("div", { class: "reqs-platform-block" },
    el("h4", { class: "reqs-platform-name", text: name }),
    ...[["Minimum", minimum], ["Recommended", recommended]].map(([label, text]) =>
      (text ? el("div", { class: "reqs-sub" }, el("strong", { text: label }), el("p", { class: "reqs-text", text })) : null)),
  );
  const listed = (rawgPlatforms || []).filter(({ requirements: req }) => req && (req.minimum || req.recommended || typeof req === "string"));
  const blocks = listed.map(({ name, requirements: req }) =>
    (typeof req === "string" ? block(name || "PC", req, "") : block(name || "PC", req.minimum || "", req.recommended || "")));
  if (!blocks.length && platforms.some((p) => /pc|windows/i.test(p))) blocks.push(block("PC / Windows", ...TYPICAL_PC));
  return blocks.length ? el("details", { class: "detail-card reqs-dropdown" },
    el("summary", { class: "detail-card-title reqs-summary", text: "System Requirements" }),
    el("div", { class: "detail-reqs-content" }, ...blocks),
  ) : null;
}

// The details page isn't one of the lists renderAll() redraws, so it redraws itself after a change
async function redrawAfter(change, buttonId) {
  await change;
  if (!location.hash.startsWith("#game")) return;
  renderGameDetailView();
  $(buttonId)?.focus();
}

function renderGameDetailView() {
  const container = $("game-detail-view");
  // The address names the game. It can differ from the one in memory after the browser's Back button,
  // or when coming back from a player's page, so go by the address.
  const wanted = location.hash.slice(1).split(/[:?&]/)[1] || "";
  if (!detail.game || (wanted && wanted !== hashIdFor(detail.game))) {
    const named = findGameFromHash(location.hash);
    if (named && named !== detail.game) showGame(named);
  }
  const game = detail.game;
  if (!game) {
    return container.replaceChildren(
      el("div", { class: "panel-bar" }, el("h2", { text: "Game not found" })),
      el("div", { class: "panel-body" }, el("p", { class: "hint", text: "No game selected." }), el("a", { class: "btn btn-primary", href: "#home", text: "Go to Home" })),
    );
  }
  if (!detail.rawg && game.rawg_id) loadGameDetails(game);

  const rawg = detail.rawg || {};
  const title = rawg.name || rawg.title || game.title || "Game Details";
  const released = rawg.released || game.released || "";
  const rating = parseFloat(rawg.rating || game.rating) || 0;
  const playtime = rawg.playtime || game.playtime || null;
  const metacritic = rawg.metacritic || game.metacritic || null;
  const genres = rawg.genres || genresOf(game);
  const developers = listOf(rawg.developers || game.developers);
  const publishers = listOf(rawg.publishers || game.publishers);
  const website = rawg.website || game.website || null;
  const esrb = rawg.esrb || game.esrb || null;
  const platforms = rawg.platforms?.length ? rawg.platforms.map((p) => (typeof p === "string" ? p : p.name)).filter(Boolean) : platformNames(game);
  const shots = rawg.screenshots?.length ? rawg.screenshots : [rawg.background_image || game.image, rawg.background_image_additional].filter(Boolean);
  const stores = Array.isArray(rawg.stores) ? rawg.stores.filter((s) => s.name) : [];
  const have = owned(game);
  const wished = !have && Boolean(wishOf(game));
  const previous = store.back() || "home";
  const previousLabel = TAB_LABELS[previous] || (previous.startsWith("user:") ? usernameIn(previous) || "Player" : "Games");

  // What Add to collection and Wishlist save
  const payload = () => ({
    rawg_id: game.rawg_id || rawg.id || null, title, released: released || null, rating: rating || null,
    image: shots[detail.shot] || shots[0] || game.image || null, platforms, genres, developers, publishers, website, esrb, metacritic, playtime,
  });

  const hero = el("div", { class: "detail-hero" },
    el("div", { class: "detail-hero-info" },
      el("div", { class: "detail-kicker-row" },
        released ? el("span", { class: "chip chip-dark", text: shortDate(released) }) : null,
        rating > 0 ? el("span", { class: "chip chip-rating", title: "RAWG player rating" }, icon("star"), el("span", { text: rating.toFixed(1) + " / 5" })) : null,
        metacritic ? el("span", { class: "chip chip-meta", title: "Metacritic score" }, el("strong", { text: "Metacritic: " + metacritic })) : null,
        playtime ? el("span", { class: "chip", title: "Average Playtime" }, icon("clock"), el("span", { text: playtime + " hrs avg" })) : null,
      ),
      el("h2", { class: "detail-heading", text: title }),
      el("div", { class: "detail-platforms-row tags" }, ...platformTags({ platforms }).map(platformChip)),
    ),
    el("div", { class: "detail-hero-actions" },
      el("button", {
        id: "detail-add-btn",
        class: "btn " + (have ? "btn-ghost is-saved" : "btn-primary"),
        type: "button",
        disabled: have,
        "aria-label": (have ? "Already in your collection: " : "Add to your collection: ") + title,
        onclick: (e) => redrawAfter(addResult(payload(), e.currentTarget), "detail-add-btn"),
      }, icon(have ? "check" : "plus"), el("span", { text: have ? "In collection" : "Add to collection" })),
      have ? null : el("button", {
        id: "detail-wish-btn",
        class: "btn btn-ghost btn-wish" + (wished ? " is-on" : ""),
        type: "button",
        "aria-label": (wished ? "Remove from your wishlist: " : "Add to your wishlist: ") + title,
        onclick: (e) => redrawAfter(toggleWish(payload(), e.currentTarget), "detail-wish-btn"),
      }, icon(wished ? "heart-solid" : "heart"), el("span", { text: wished ? "On wishlist" : "Wishlist" })),
    ),
  );

  const details = card("Game details", el("dl", { class: "detail-table-grid" },
    row("Platforms", chipList(platforms, "chip-sm")),
    row("Genres", chipList(genres, "chip-sm")),
    row("Release date", el("dd", { text: shortDate(released) })),
    developers.length ? row("Developer", el("dd", { text: developers.join(", ") })) : null,
    publishers.length ? row("Publisher", el("dd", { text: publishers.join(", ") })) : null,
    esrb ? row("Age rating", el("dd", { text: esrb })) : null,
    website ? row("Website", el("dd", {}, el("a", { class: "text-link", href: website, target: "_blank", rel: "noopener noreferrer", text: website }, icon("external"))), true) : null,
    rawg.tags?.length ? row("Tags", chipList(rawg.tags.slice(0, 16), "chip-tag", { class: "tags-wrap" }), true) : null,
  ));

  const buy = stores.length ? card("Where to buy",
    el("p", { class: "hint", text: "Official stores listed on RAWG:" }),
    el("div", { class: "store-buttons-grid" }, ...stores.map((s) =>
      el("a", { class: "btn btn-ghost store-link-btn", href: s.url, target: "_blank", rel: "noopener noreferrer" },
        icon(s.name.toLowerCase().includes("steam") ? "steam" : "arcade"), el("span", { text: s.name }), icon("external")))),
  ) : null;

  container.replaceChildren(
    el("div", { class: "panel-bar" },
      el("div", { class: "detail-bar-nav" },
        el("button", { id: "detail-back-btn", class: "btn btn-ghost btn-sm", type: "button", "aria-label": "Go back to previous view", onclick: () => { location.hash = backTo(); } },
          icon("arrow-left"), el("span", { text: "Back" })),
        el("nav", { class: "detail-breadcrumb", "aria-label": "Breadcrumb" },
          el("a", { class: "bc-link", href: "#home", text: "Home" }),
          el("span", { class: "bc-sep", text: "/" }),
          ...(previous === "home" ? [] : [el("a", { class: "bc-link", href: "#" + previous, text: previousLabel }), el("span", { class: "bc-sep", text: "/" })]),
          el("strong", { class: "bc-current", text: title }),
        ),
      ),
      el("div", { class: "detail-bar-status" },
        have ? el("span", { class: "chip chip-badge chip-owned", text: "In your collection" }) : null,
        wished ? el("span", { class: "chip chip-badge chip-wished", text: "On your wishlist" }) : null,
        el("span", { class: "bar-note", text: "RAWG Database" }),
      ),
    ),
    el("div", { class: "panel-body detail-panel-body" },
      hero,
      el("div", { class: "detail-grid-cols" },
        el("div", { class: "detail-col-main" },
          aboutCard(rawg.description_raw || rawg.description || ""),
          details,
          requirementsCard(rawg.platforms, platforms),
          buildForumCard(game, title),
        ),
        el("div", { class: "detail-col-side" }, shots.length ? galleryCard(shots, title) : null, buy),
      ),
    ),
  );
}

window.addEventListener("tab-shown", (e) => {
  if (e.detail?.name === "game") renderGameDetailView();
});
