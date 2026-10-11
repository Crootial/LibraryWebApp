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

function resultRow(result) {
  const rating = ratingOf(result);
  const facts = [yearOf(result), rating && rating.toFixed(1) + " / 5"].filter(Boolean).join(" · ");
  const titleEl = el("p", {
    class: "result-title clickable-title",
    text: result.title,
    role: "button",
    tabindex: "0",
    "aria-label": "View details for " + result.title,
  });
  const handleOpen = (e) => {
    e.stopPropagation();
    if (typeof openGameDetail === "function") openGameDetail(result);
  };
  titleEl.addEventListener("click", handleOpen);
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen(e);
    }
  });
  return el("li", { class: "result" },
    cover(result, "sm"),
    el("div", { class: "result-body" },
      titleEl,
      facts ? el("p", { class: "result-meta", text: facts }) : null,
      el("p", { class: "tags" }, ...platformTags(result).map(platformChip)),
      saveActions(result),
    ),
    detailsPanel(result, {
      isOpen: openCards.results.has(result.rawg_id),
      onToggle: remember(openCards.results, result.rawg_id),
    }),
  );
}

function renderResults() {
  $("results").replaceChildren(...store.results.map(resultRow));
}

// "Coming Nov 19, 2026" for a game that isn't out yet, or null for one that is. RAWG gives Dec 31 to
// games that only have a year announced, so those show the year alone.
function comingLabel(game) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(game.released ?? ""));
  if (!match) return null;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  if (match[0] <= now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())) return null;
  return "Coming " + (match[2] + "-" + match[3] === "12-31" ? match[1] : formatDetailDate(match[0]));
}

function trendCard(result, rank) {
  const body = cardBody(result, "trend-body");
  const coming = comingLabel(result);
  if (coming) body.querySelector(".tags").prepend(el("span", { class: "chip chip-dark", title: "Not out yet", text: coming }));
  body.append(saveActions(result));
  return el("li", { class: "trend" },
    el("div", { class: "trend-art" },
      cover(result, "lg"),
      el("span", { class: "rank", "aria-hidden": "true", text: "#" + rank }),
    ),
    body,
    detailsPanel(result, {
      isOpen: openCards.trending.has(result.rawg_id),
      onToggle: remember(openCards.trending, result.rawg_id),
    }),
  );
}

function renderTrending(enter = false) {
  if (!store.trending) return;
  drawCards($("trending"), store.trending.map((game, i) => trendCard(game, i + 1)), enter);
}

function refreshButtons(container, items) {
  [...container.children].forEach((card, i) => {
    const old = card.querySelector(".save-actions");
    if (old && items[i]) old.replaceWith(saveActions(items[i]));
  });
}

function renderBrowse() {
  refreshButtons($("results"), store.results);
  refreshButtons($("trending"), store.trending || []);
}

async function loadTrending() {
  const list = $("trending");
  const empty = $("trending-empty");
  store.trending = null;
  showSkeletons(list, 4);
  empty.hidden = true;
  try {
    store.trending = await api("/api/trending");
    renderTrending(true);
    if (!store.trending.length) fillEmpty(empty, { title: "Nothing is trending", text: "RAWG has no recent games to show right now. Check back soon." });
  } catch (err) {
    list.replaceChildren();
    fillEmpty(empty, { title: "Couldn't load trending games", text: err.message, retry: loadTrending });
  } finally {
    list.removeAttribute("aria-busy");
  }
}

async function addResult(result, button) {
  if (!store.user) return askToSignIn("Sign in to add games to your collection.");
  const restoreFocus = holdFocus(button);
  setBusy(button, true, "Adding");
  try {
    collect(await api("/api/games", { method: "POST", body: await withFetched(result) }));
    restoreFocus();
  } catch (err) {
    actionFailed(err, button);
  }
}

function initLookupForm() {
  const lookupForm = $("lookup-form");
  const status = $("lookup-status");
  watchForm(lookupForm);

  lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(lookupForm);
    const title = lookupForm.elements.search.value.trim();
    if (!title) return showFormError(lookupForm, "Type a title to search for.", "search");
    const button = lookupForm.querySelector("button[type=submit]");
    setBusy(button, true, "Searching");
    status.textContent = "";
    try {
      store.results = await api("/api/lookup?title=" + encodeURIComponent(title));
      if (!store.results.length) status.textContent = "No games found on RAWG for “" + title + "”.";
    } catch (err) {
      store.results = [];
      showFormError(lookupForm, err.message);
    } finally {
      renderResults();
      setBusy(button, false);
    }
  });
}
