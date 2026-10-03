// Lookup results and the trending list: games that are not yet the person's own.

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
      isOpen: openCards.results.has(result.rawg_id),
      onToggle: remember(openCards.results, result.rawg_id),
    }),
  );
}

function renderResults() {
  $("results").replaceChildren(...store.results.map(resultRow));
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
      isOpen: openCards.trending.has(result.rawg_id),
      onToggle: remember(openCards.trending, result.rawg_id),
    }),
  );
}

function renderTrending(enter = false) {
  if (!store.trending) return; // still loading: leave the placeholders alone
  drawCards($("trending"), store.trending.map((game, i) => trendCard(game, i + 1)), enter);
}

// Search results and trending games both show whether a game is owned or wished for. When that
// changes only their buttons are redrawn, so a click doesn't make the rest of the cards blink.
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

// The backend keeps whatever it is sent, so a search result is saved exactly as it came back.
// If its details were already opened they go along with it.
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

// The "Look up online" form.
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
