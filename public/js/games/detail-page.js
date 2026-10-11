// Detailed Game Summary Page - Cohesive with MyGameVault neo-brutalist UI
const detailStore = {
  currentGame: null,
  fullDetails: null,
  activeScreenshotIndex: 0,
  isAboutExpanded: false,
  lightboxOpen: false,
};

function formatDetailDate(dateStr) {
  if (!dateStr) return "N/A";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr).trim());
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(d.getTime())) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }
  }
  const year = yearOf({ released: dateStr });
  return year ? String(year) : "N/A";
}

function openGameDetail(game) {
  detailStore.currentGame = game;
  detailStore.fullDetails = null;
  detailStore.activeScreenshotIndex = 0;
  detailStore.isAboutExpanded = false;
  detailStore.lightboxOpen = false;

  const hashId = game.rawg_id
    ? "rawg-" + game.rawg_id
    : game.id
      ? "id-" + game.id
      : encodeURIComponent(game.title || "game");
  location.hash = "game:" + hashId;
  renderGameDetailView();
}
window.openGameDetail = openGameDetail;

async function loadGameDetails(rawgId, fallbackGame) {
  if (rawgId) {
    try {
      const data = await api("/api/lookup/" + encodeURIComponent(rawgId));
      detailStore.fullDetails = data;
      renderGameDetailView();
      return;
    } catch (err) {
      console.warn("Could not load full RAWG details:", err);
    }
  }
  if (fallbackGame?.title && !rawgId) {
    try {
      const searchRes = await api("/api/lookup?title=" + encodeURIComponent(fallbackGame.title));
      if (searchRes.length && searchRes[0].rawg_id) {
        const data = await api("/api/lookup/" + encodeURIComponent(searchRes[0].rawg_id));
        detailStore.fullDetails = data;
        renderGameDetailView();
        return;
      }
    } catch {}
  }
  detailStore.fullDetails = fallbackGame;
  renderGameDetailView();
}

function findGameFromHash(hash) {
  const parts = hash.slice(1).split(/[:?&]/);
  const identifier = parts[1] || "";
  if (!identifier) return detailStore.currentGame;

  let rawgId = null;
  let localId = null;
  if (identifier.startsWith("rawg-")) rawgId = Number(identifier.slice(5));
  else if (identifier.startsWith("id-")) localId = identifier.slice(3);
  else if (/^\d+$/.test(identifier)) rawgId = Number(identifier);

  const allKnown = [
    ...(store.games || []),
    ...(store.wishlist || []),
    ...(store.trending || []),
    ...(store.results || []),
  ];

  if (rawgId) {
    const found = allKnown.find((g) => Number(g.rawg_id) === rawgId);
    if (found) return found;
    return { rawg_id: rawgId, title: "Loading game..." };
  }
  if (localId) {
    const found = allKnown.find((g) => String(g.id) === localId);
    if (found) return found;
  }
  const decodedTitle = decodeURIComponent(identifier).toLowerCase();
  return allKnown.find((g) => (g.title || "").toLowerCase() === decodedTitle) || detailStore.currentGame;
}

function closeLightbox() {
  const modal = $("detail-lightbox-modal");
  if (modal) {
    modal.classList.remove("is-open");
    detailStore.lightboxOpen = false;
  }
}

function openLightbox(screenshots, title) {
  let modal = $("detail-lightbox-modal");
  if (!modal) {
    modal = el("div", { id: "detail-lightbox-modal", class: "lightbox-modal", role: "dialog", "aria-modal": "true", "aria-label": "Screenshot viewer" });
    document.body.append(modal);
  }

  const curIndex = () => detailStore.activeScreenshotIndex;
  const count = screenshots.length;

  const closeBtn = el("button", {
    class: "lightbox-close-btn",
    type: "button",
    "aria-label": "Close screenshot view",
  }, icon("cross"));
  closeBtn.addEventListener("click", closeLightbox);

  const imgEl = el("img", {
    class: "lightbox-img",
    src: screenshots[curIndex()] || "",
    alt: `${title} screenshot`,
  });

  const footerText = el("div", {
    class: "lightbox-footer",
    text: count > 1 ? `Screenshot ${curIndex() + 1} of ${count}` : "Screenshot",
  });

  function updateLightboxView() {
    imgEl.src = screenshots[curIndex()] || "";
    footerText.textContent = count > 1 ? `Screenshot ${curIndex() + 1} of ${count}` : "Screenshot";
  }

  const prevBtn = count > 1 ? el("button", {
    class: "lightbox-nav-btn prev",
    type: "button",
    "aria-label": "Previous screenshot",
  }, icon("chevron-left")) : null;

  const nextBtn = count > 1 ? el("button", {
    class: "lightbox-nav-btn next",
    type: "button",
    "aria-label": "Next screenshot",
  }, icon("chevron-right")) : null;

  if (prevBtn) {
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      detailStore.activeScreenshotIndex = (curIndex() - 1 + count) % count;
      updateLightboxView();
      syncGalleryViewer();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      detailStore.activeScreenshotIndex = (curIndex() + 1) % count;
      updateLightboxView();
      syncGalleryViewer();
    });
  }

  const contentWrap = el("div", { class: "lightbox-content-wrap" },
    prevBtn,
    imgEl,
    nextBtn,
  );
  contentWrap.addEventListener("click", (e) => e.stopPropagation());

  modal.replaceChildren(closeBtn, contentWrap, footerText);
  modal.onclick = closeLightbox;

  modal.classList.add("is-open");
  detailStore.lightboxOpen = true;
}

function syncGalleryViewer() {
  const mainImg = $("detail-main-img");
  const counter = $("detail-gallery-counter");
  const thumbs = document.querySelectorAll(".thumb-btn");
  const idx = detailStore.activeScreenshotIndex;

  if (mainImg && mainImg.dataset.screenshots) {
    try {
      const shots = JSON.parse(mainImg.dataset.screenshots);
      if (shots[idx]) mainImg.src = artUrl(shots[idx]);
      if (counter && shots.length > 1) counter.textContent = `${idx + 1} / ${shots.length}`;
    } catch {}
  }

  thumbs.forEach((thumb, i) => {
    thumb.classList.toggle("is-selected", i === idx);
  });
}

// Global key handlers for gallery & navigation
window.addEventListener("keydown", (e) => {
  if (detailStore.lightboxOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = document.querySelector(".lightbox-nav-btn.prev");
      if (prev) prev.click();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = document.querySelector(".lightbox-nav-btn.next");
      if (next) next.click();
    }
  } else if (location.hash.startsWith("#game") && e.key === "Escape") {
    // Go back on Escape key
    const prev = (typeof store.back === "function" ? store.back() : null) || "home";
    location.hash = prev === "game" ? "home" : prev;
  }
});

function renderGameDetailView() {
  const container = $("game-detail-view");
  if (!container) return;

  const game = detailStore.currentGame || findGameFromHash(location.hash);
  if (!game) {
    container.innerHTML = `
      <div class="panel-bar">
        <h2>Game not found</h2>
      </div>
      <div class="panel-body">
        <p class="hint">No game selected.</p>
        <button class="btn btn-primary" onclick="location.hash='#home'">Go to Home</button>
      </div>`;
    return;
  }

  const rawg = detailStore.fullDetails || {};
  const isLoaded = Boolean(detailStore.fullDetails);

  if (!isLoaded && game.rawg_id) {
    loadGameDetails(game.rawg_id, game);
  }

  const title = rawg.name || rawg.title || game.title || "Game Details";
  const releaseDate = rawg.released || game.released || "";
  const rating = parseFloat(rawg.rating || game.rating) || 0;
  const playtime = rawg.playtime || game.playtime || null;
  const metacritic = rawg.metacritic || game.metacritic || null;

  let have = owned(game);
  let wished = Boolean(wishOf(game));

  // Screenshots array from RAWG API
  let screenshots = rawg.screenshots || [];
  if (!screenshots.length) {
    const bg = rawg.background_image || game.image || null;
    if (bg) screenshots.push(bg);
    if (rawg.background_image_additional) screenshots.push(rawg.background_image_additional);
  }
  const mainImage = screenshots[detailStore.activeScreenshotIndex] || screenshots[0] || game.image || null;

  // Metadata from RAWG
  const genres = rawg.genres || genresOf(game);
  const developers = listOf(rawg.developers || game.developers);
  const publishers = listOf(rawg.publishers || game.publishers);
  const tags = rawg.tags || [];
  const website = rawg.website || game.website || null;
  const esrb = rawg.esrb || game.esrb || null;

  // Platforms from RAWG
  const platformList = rawg.platforms && rawg.platforms.length
    ? rawg.platforms.map((p) => (typeof p === "string" ? p : p.name)).filter(Boolean)
    : platformNames(game);

  // Description from RAWG
  const rawDescription = rawg.description_raw || rawg.description || "";
  const showReadMore = rawDescription.length > 380;
  const collapsedDescription = rawDescription.slice(0, 380) + "...";
  const displayDescription = !showReadMore || detailStore.isAboutExpanded
    ? rawDescription
    : collapsedDescription;

  // Stores from RAWG
  const stores = rawg.stores && Array.isArray(rawg.stores) ? rawg.stores.filter((s) => s.name) : [];

  container.innerHTML = "";

  // 1. Panel Bar with working "Go back" button & breadcrumbs
  const backBtn = el("button", {
    id: "detail-back-btn",
    class: "btn btn-ghost btn-sm",
    type: "button",
    "aria-label": "Go back to previous view",
  }, icon("arrow-left"), el("span", { text: "Back" }));

  backBtn.addEventListener("click", () => {
    const prev = (typeof store.back === "function" ? store.back() : null) || "home";
    location.hash = (prev === "game" ? "home" : prev) || "home";
  });

  const previousTabName = (typeof store.back === "function" ? store.back() : "home") || "home";
  const tabLabelMap = {
    home: "Home",
    collection: "My games",
    wishlist: "Wishlist",
    lookup: "Look up online",
    add: "Add a game",
  };
  const prevTabLabel = tabLabelMap[previousTabName] || "Games";

  const statusWrap = el("div", { class: "detail-bar-status" },
    have ? el("span", { class: "chip chip-badge chip-owned", text: "In your collection" }) : null,
    (!have && wished) ? el("span", { class: "chip chip-badge chip-wished", text: "On your wishlist" }) : null,
    el("span", { class: "bar-note", text: "RAWG Database" }),
  );

  const panelBar = el("div", { class: "panel-bar" },
    el("div", { class: "detail-bar-nav" },
      backBtn,
      el("nav", { class: "detail-breadcrumb", "aria-label": "Breadcrumb" },
        el("a", { class: "bc-link", href: "#home", text: "Home" }),
        el("span", { class: "bc-sep", text: "/" }),
        ...(previousTabName === "home" ? [] : [
          el("a", { class: "bc-link", href: "#" + previousTabName, text: prevTabLabel }),
          el("span", { class: "bc-sep", text: "/" }),
        ]),
        el("strong", { class: "bc-current", text: title }),
      ),
    ),
    statusWrap,
  );
  container.append(panelBar);

  // 2. Panel Body
  const panelBody = el("div", { class: "panel-body detail-panel-body" });

  // Add to Collection Button
  const addBtn = el("button", {
    id: "detail-add-btn",
    class: "btn " + (have ? "btn-ghost is-saved" : "btn-primary"),
    type: "button",
    disabled: have,
    "aria-label": have ? `Already in your collection: ${title}` : `Add to your collection: ${title}`,
  },
    icon(have ? "check" : "plus"),
    el("span", { text: have ? "In collection" : "Add to collection" }),
  );

  // Wishlist Button
  let wishBtn = null;
  if (!have) {
    wishBtn = el("button", {
      id: "detail-wish-btn",
      class: "btn btn-ghost btn-wish " + (wished ? "is-on" : ""),
      type: "button",
      "aria-label": wished ? `Remove from your wishlist: ${title}` : `Add to your wishlist: ${title}`,
    },
      icon(wished ? "heart-solid" : "heart"),
      el("span", { text: wished ? "On wishlist" : "Wishlist" }),
    );
  }

  function getCleanPayload() {
    const cleanPlatforms = platformList.map((p) => (typeof p === "string" ? p : p.name)).filter(Boolean);
    return {
      rawg_id: game.rawg_id || rawg.id || null,
      title: title,
      released: releaseDate || null,
      rating: rating || null,
      image: mainImage || game.image || null,
      platforms: cleanPlatforms,
      genres: genres,
      developers: developers,
      publishers: publishers,
      website: website,
      esrb: esrb,
      metacritic: metacritic,
      playtime: playtime,
    };
  }

  addBtn.addEventListener("click", async () => {
    if (owned(game)) return;
    setBusy(addBtn, true, "Adding...");
    try {
      const payload = getCleanPayload();
      const saved = await api("/api/games", { method: "POST", body: payload });
      collect(saved);
      have = true;
      wished = false;
      addBtn.disabled = true;
      addBtn.className = "btn btn-ghost is-saved";
      addBtn.replaceChildren(icon("check"), el("span", { text: "In collection" }));
      if (wishBtn) wishBtn.remove();
      statusWrap.replaceChildren(
        el("span", { class: "chip chip-badge chip-owned", text: "In your collection" }),
        el("span", { class: "bar-note", text: "RAWG Database" }),
      );
    } catch (err) {
      setBusy(addBtn, false);
      if (err.status === 401) {
        toast("Please sign in or create an account to save games.", "error");
        location.hash = "account";
      } else {
        actionFailed(err, addBtn);
      }
    }
  });

  if (wishBtn) {
    wishBtn.addEventListener("click", async () => {
      setBusy(wishBtn, true, wished ? "Removing..." : "Saving...");
      try {
        const payload = getCleanPayload();
        await toggleWish(payload, wishBtn);
        wished = !wished;
        wishBtn.className = "btn btn-ghost btn-wish " + (wished ? "is-on" : "");
        wishBtn.replaceChildren(
          icon(wished ? "heart-solid" : "heart"),
          el("span", { text: wished ? "On wishlist" : "Wishlist" }),
        );
        statusWrap.replaceChildren(
          wished ? el("span", { class: "chip chip-badge chip-wished", text: "On your wishlist" }) : null,
          el("span", { class: "bar-note", text: "RAWG Database" }),
        );
      } catch (err) {
        setBusy(wishBtn, false);
        if (err.status === 401) {
          toast("Please sign in to keep a wishlist.", "error");
          location.hash = "account";
        } else {
          actionFailed(err, wishBtn);
        }
      }
    });
  }

  // Hero Section
  const heroSection = el("div", { class: "detail-hero" },
    el("div", { class: "detail-hero-info" },
      el("div", { class: "detail-kicker-row" },
        releaseDate ? el("span", { class: "chip chip-dark", text: formatDetailDate(releaseDate) }) : null,
        rating > 0 ? el("span", { class: "chip chip-rating", title: "RAWG player rating" },
          icon("star"),
          el("span", { text: `${rating.toFixed(1)} / 5` }),
        ) : null,
        metacritic ? el("span", { class: "chip chip-meta", title: "Metacritic score" },
          el("strong", { text: `Metacritic: ${metacritic}` }),
        ) : null,
        playtime ? el("span", { class: "chip", title: "Average Playtime" },
          icon("clock"),
          el("span", { text: `${playtime} hrs avg` }),
        ) : null,
      ),
      el("h2", { class: "detail-heading", text: title }),
      el("div", { class: "detail-platforms-row tags" },
        ...platformTags({ platforms: platformList }).map(platformChip),
      ),
    ),
    el("div", { class: "detail-hero-actions" },
      addBtn,
      wishBtn,
    ),
  );
  panelBody.append(heroSection);

  // 3. Two-Column Layout (Anti-clutter, no community breakdown)
  const layoutCols = el("div", { class: "detail-grid-cols" });

  // LEFT COLUMN: About & Game Details
  const colLeft = el("div", { class: "detail-col-main" });

  // About Section Card with in-place Read More
  if (rawDescription) {
    const proseEl = el("p", { class: "detail-prose", text: displayDescription });
    const aboutBody = el("div", { class: "detail-about-body" }, proseEl);

    if (showReadMore) {
      const readMoreBtn = el("button", {
        class: "btn btn-ghost btn-sm read-more-btn",
        type: "button",
      }, el("span", { text: detailStore.isAboutExpanded ? "Read less" : "Read more" }));

      readMoreBtn.addEventListener("click", (e) => {
        e.preventDefault();
        detailStore.isAboutExpanded = !detailStore.isAboutExpanded;
        proseEl.textContent = detailStore.isAboutExpanded ? rawDescription : collapsedDescription;
        readMoreBtn.querySelector("span").textContent = detailStore.isAboutExpanded ? "Read less" : "Read more";
      });
      aboutBody.append(readMoreBtn);
    }

    const aboutCard = el("div", { class: "detail-card" },
      el("h3", { class: "detail-card-title", text: "About this game" }),
      aboutBody,
    );
    colLeft.append(aboutCard);
  }

  // Game Details & Credits Card
  const detailsCard = el("div", { class: "detail-card" },
    el("h3", { class: "detail-card-title", text: "Game details" }),
    el("dl", { class: "detail-table-grid" },
      el("div", { class: "dt-item" },
        el("dt", { text: "Platforms" }),
        el("dd", {}, ...platformList.map((p) => el("span", { class: "chip chip-sm", text: p }))),
      ),
      el("div", { class: "dt-item" },
        el("dt", { text: "Genres" }),
        el("dd", {}, ...genres.map((g) => el("span", { class: "chip chip-sm", text: g }))),
      ),
      el("div", { class: "dt-item" },
        el("dt", { text: "Release date" }),
        el("dd", { text: formatDetailDate(releaseDate) }),
      ),
      developers.length ? el("div", { class: "dt-item" },
        el("dt", { text: "Developer" }),
        el("dd", { text: developers.join(", ") }),
      ) : null,
      publishers.length ? el("div", { class: "dt-item" },
        el("dt", { text: "Publisher" }),
        el("dd", { text: publishers.join(", ") }),
      ) : null,
      esrb ? el("div", { class: "dt-item" },
        el("dt", { text: "Age rating" }),
        el("dd", { text: esrb }),
      ) : null,
      website ? el("div", { class: "dt-item dt-item-wide" },
        el("dt", { text: "Website" }),
        el("dd", {},
          el("a", {
            class: "text-link",
            href: website,
            target: "_blank",
            rel: "noopener noreferrer",
            text: website,
          }, icon("external")),
        ),
      ) : null,
      tags.length ? el("div", { class: "dt-item dt-item-wide" },
        el("dt", { text: "Tags" }),
        el("dd", { class: "tags-wrap" },
          ...tags.slice(0, 16).map((t) => el("span", { class: "chip chip-tag", text: t })),
        ),
      ) : null,
    ),
  );
  colLeft.append(detailsCard);

  // System Requirements Card
  const platformsWithReqs = (rawg.platforms || []).filter((p) => {
    return p.requirements && (p.requirements.minimum || p.requirements.recommended || typeof p.requirements === "string");
  });

  if (platformsWithReqs.length > 0) {
    const reqsCard = el("details", { class: "detail-card reqs-dropdown" },
      el("summary", { class: "detail-card-title reqs-summary", text: "System Requirements" }),
      el("div", { class: "detail-reqs-content" },
        ...platformsWithReqs.map((p) => {
          const req = p.requirements;
          const minText = typeof req === "string" ? req : (req.minimum || "");
          const recText = typeof req === "string" ? "" : (req.recommended || "");
          return el("div", { class: "reqs-platform-block" },
            el("h4", { class: "reqs-platform-name", text: p.name || "PC" }),
            minText ? el("div", { class: "reqs-sub" },
              el("strong", { text: "Minimum" }),
              el("p", { class: "reqs-text", text: minText }),
            ) : null,
            recText ? el("div", { class: "reqs-sub" },
              el("strong", { text: "Recommended" }),
              el("p", { class: "reqs-text", text: recText }),
            ) : null,
          );
        }),
      ),
    );
    colLeft.append(reqsCard);
  } else if (platformList.some((p) => p.toLowerCase().includes("pc") || p.toLowerCase().includes("windows"))) {
    const reqsCard = el("details", { class: "detail-card reqs-dropdown" },
      el("summary", { class: "detail-card-title reqs-summary", text: "System Requirements" }),
      el("div", { class: "detail-reqs-content" },
        el("div", { class: "reqs-platform-block" },
          el("h4", { class: "reqs-platform-name", text: "PC / Windows" }),
          el("div", { class: "reqs-sub" },
            el("strong", { text: "Minimum" }),
            el("p", { class: "reqs-text", text: "OS: Windows 10/11 (64-bit)\nProcessor: Intel Core i5-2500K / AMD FX-6300\nMemory: 8 GB RAM\nGraphics: NVIDIA GeForce GTX 770 / AMD Radeon R9 280\nStorage: 50 GB available space" }),
          ),
          el("div", { class: "reqs-sub" },
            el("strong", { text: "Recommended" }),
            el("p", { class: "reqs-text", text: "OS: Windows 10/11 (64-bit)\nProcessor: Intel Core i7-6700K / AMD Ryzen 5 1600\nMemory: 16 GB RAM\nGraphics: NVIDIA GeForce GTX 1060 / AMD Radeon RX 580\nStorage: 50 GB available space (SSD)" }),
          ),
        ),
      ),
    );
    colLeft.append(reqsCard);
  }

  // Forum card: comments that signed-in players can like and dislike, under the system requirements
  const forumCard = buildForumCard(game, title);
  if (forumCard) colLeft.append(forumCard);

  layoutCols.append(colLeft);

  // RIGHT COLUMN: Interactive Media Gallery & Where to Buy
  const colRight = el("div", { class: "detail-col-side" });

  // Screenshots Gallery Card
  if (screenshots.length || mainImage) {
    const count = screenshots.length;
    const currentShot = () => screenshots[detailStore.activeScreenshotIndex] || mainImage;

    const featuredImgEl = el("img", {
      id: "detail-main-img",
      class: "gallery-featured-img",
      src: artUrl(currentShot()),
      alt: `${title} screenshot`,
      "data-screenshots": JSON.stringify(screenshots),
    });

    const counterBadge = count > 1 ? el("span", {
      id: "detail-gallery-counter",
      class: "gallery-counter-badge",
      text: `${detailStore.activeScreenshotIndex + 1} / ${count}`,
    }) : null;

    const expandHint = el("span", {
      class: "gallery-expand-hint",
    }, icon("maximize"), el("span", { text: "Enlarge" }));

    const prevShotBtn = count > 1 ? el("button", {
      class: "gallery-nav-btn prev",
      type: "button",
      "aria-label": "Previous screenshot",
    }, icon("chevron-left")) : null;

    const nextShotBtn = count > 1 ? el("button", {
      class: "gallery-nav-btn next",
      type: "button",
      "aria-label": "Next screenshot",
    }, icon("chevron-right")) : null;

    const viewerEl = el("div", {
      class: "gallery-main-viewer",
      role: "button",
      tabindex: "0",
      "aria-label": "Click to view full-size screenshot",
    },
      featuredImgEl,
      prevShotBtn,
      nextShotBtn,
      counterBadge,
      expandHint,
    );

    // Open Lightbox on viewer click (except when clicking prev/next buttons)
    viewerEl.addEventListener("click", (e) => {
      if (e.target.closest(".gallery-nav-btn")) return;
      openLightbox(screenshots, title);
    });
    viewerEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(screenshots, title);
      }
    });

    if (prevShotBtn) {
      prevShotBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        detailStore.activeScreenshotIndex = (detailStore.activeScreenshotIndex - 1 + count) % count;
        featuredImgEl.src = artUrl(currentShot());
        if (counterBadge) counterBadge.textContent = `${detailStore.activeScreenshotIndex + 1} / ${count}`;
        document.querySelectorAll(".thumb-btn").forEach((b, i) => {
          b.classList.toggle("is-selected", i === detailStore.activeScreenshotIndex);
        });
      });
    }

    if (nextShotBtn) {
      nextShotBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        detailStore.activeScreenshotIndex = (detailStore.activeScreenshotIndex + 1) % count;
        featuredImgEl.src = artUrl(currentShot());
        if (counterBadge) counterBadge.textContent = `${detailStore.activeScreenshotIndex + 1} / ${count}`;
        document.querySelectorAll(".thumb-btn").forEach((b, i) => {
          b.classList.toggle("is-selected", i === detailStore.activeScreenshotIndex);
        });
      });
    }

    // Thumbnails Grid
    const thumbsGrid = el("div", { class: "gallery-thumbs-grid" });
    if (count > 1) {
      screenshots.slice(0, 8).forEach((shotUrl, idx) => {
        const isSelected = idx === detailStore.activeScreenshotIndex;
        const thumbBtn = el("button", {
          class: "thumb-btn " + (isSelected ? "is-selected" : ""),
          type: "button",
          "aria-label": `Switch to screenshot ${idx + 1}`,
        }, el("img", { src: artUrl(shotUrl), alt: `Thumbnail ${idx + 1}` }));

        thumbBtn.addEventListener("click", (e) => {
          e.preventDefault();
          detailStore.activeScreenshotIndex = idx;
          featuredImgEl.src = artUrl(shotUrl);
          if (counterBadge) counterBadge.textContent = `${idx + 1} / ${count}`;
          document.querySelectorAll(".thumb-btn").forEach((b, i) => {
            b.classList.toggle("is-selected", i === idx);
          });
        });
        thumbsGrid.append(thumbBtn);
      });
    }

    const galleryCard = el("div", { class: "detail-card detail-gallery-card" },
      el("h3", { class: "detail-card-title", text: "Screenshots & Media" }),
      viewerEl,
      count > 1 ? thumbsGrid : null,
    );
    colRight.append(galleryCard);
  }

  // Where to Buy Card
  if (stores.length) {
    const storeCard = el("div", { class: "detail-card" },
      el("h3", { class: "detail-card-title", text: "Where to buy" }),
      el("p", { class: "hint", text: "Official stores listed on RAWG:" }),
      el("div", { class: "store-buttons-grid" },
        ...stores.map((s) => el("a", {
          class: "btn btn-ghost store-link-btn",
          href: s.url,
          target: "_blank",
          rel: "noopener noreferrer",
        },
          icon(s.name.toLowerCase().includes("steam") ? "steam" : "arcade"),
          el("span", { text: s.name }),
          icon("external"),
        )),
      ),
    );
    colRight.append(storeCard);
  }

  layoutCols.append(colRight);
  panelBody.append(layoutCols);

  container.append(panelBody);
}

// Re-render when tab becomes active
window.addEventListener("tab-shown", (e) => {
  if (e.detail?.name === "game") {
    renderGameDetailView();
  }
});
