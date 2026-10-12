// Add to collection (or "In collection") and the wishlist heart, under a search result or a trending game
function saveActions(result) {
  const have = owned(result);
  const wished = Boolean(wishOf(result));
  const keep = el("button", {
    class: "btn btn-primary btn-sm",
    type: "button",
    text: have ? "In collection" : "Add to collection",
    "aria-label": (have ? "Already in your collection: " : "Add to your collection: ") + result.title,
    disabled: have,
    onclick: () => addResult(result, keep),
  });
  const heart = !have && el("button", {
    class: "btn btn-ghost btn-sm btn-wish" + (wished ? " is-on" : ""),
    type: "button",
    "aria-pressed": String(wished),
    "aria-label": (wished ? "Remove from your wishlist: " : "Add to your wishlist: ") + result.title,
    onclick: () => toggleWish(result, heart),
  }, icon(wished ? "heart-solid" : "heart"), el("span", { text: wished ? "On wishlist" : "Wishlist" }));
  return el("div", { class: "save-actions" }, keep, heart);
}

function resultRow(result) {
  const rating = ratingOf(result);
  const facts = [yearOf(result), rating && rating.toFixed(1) + " / 5"].filter(Boolean).join(" · ");
  return el("li", { class: "result" },
    cover(result, "sm"),
    el("div", { class: "result-body" },
      gameTitle("p", "result-title", result),
      facts ? el("p", { class: "result-meta", text: facts }) : null,
      el("p", { class: "tags" }, ...platformTags(result).map(platformChip)),
      saveActions(result),
    ),
    detailsPanel(result, { isOpen: openCards.results.has(result.rawg_id), onToggle: remember(openCards.results, result.rawg_id) }),
  );
}

// "Coming Nov 19, 2026" for a game that isn't out yet, or null. RAWG gives Dec 31 to games that only
// have a year announced, so those show the year alone.
function comingLabel(game) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(game.released ?? ""));
  const now = new Date();
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  if (!match || match[0] <= today) return null;
  return "Coming " + (match[2] + "-" + match[3] === "12-31" ? match[1] : formatDate(match[0], "short"));
}

function trendCard(result, rank) {
  const body = cardBody(result, "trend-body");
  const coming = comingLabel(result);
  if (coming) body.querySelector(".tags").prepend(el("span", { class: "chip chip-dark", title: "Not out yet", text: coming }));
  body.append(saveActions(result));
  return el("li", { class: "trend" },
    el("div", { class: "trend-art" }, cover(result, "lg"), el("span", { class: "rank", "aria-hidden": "true", text: "#" + rank })),
    body,
    detailsPanel(result, { isOpen: openCards.trending.has(result.rawg_id), onToggle: remember(openCards.trending, result.rawg_id) }),
  );
}

// Redraws only the buttons, so whatever else is open on the cards stays as it is
function renderBrowse() {
  for (const [list, items] of [[$("results"), store.results], [$("trending"), store.trending || []]]) {
    [...list.children].forEach((card, i) => items[i] && card.querySelector(".save-actions")?.replaceWith(saveActions(items[i])));
  }
}

async function loadTrending() {
  const list = $("trending");
  const empty = $("trending-empty");
  store.trending = null;
  showSkeletons(list, 4);
  empty.hidden = true;
  try {
    store.trending = await api("/api/trending");
    drawCards(list, store.trending.map((game, i) => trendCard(game, i + 1)), true);
    if (!store.trending.length) fillEmpty(empty, { title: "Nothing is trending", text: "RAWG has no recent games to show right now. Check back soon." });
  } catch (err) {
    list.replaceChildren();
    fillEmpty(empty, { title: "Couldn't load trending games", text: err.message, retry: loadTrending });
  } finally {
    list.removeAttribute("aria-busy");
  }
}

async function addResult(result, button) {
  if (!isMember()) return askToSignIn("Sign in to add games to your collection.");
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
  const form = $("lookup-form");
  const status = $("lookup-status");
  onSubmit(form, async () => {
    const title = form.elements.search.value.trim();
    if (!title) return showFormError(form, "Type a title to search for.", "search");
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Searching");
    status.textContent = "";
    try {
      store.results = await api("/api/lookup?title=" + encodeURIComponent(title));
      if (!store.results.length) status.textContent = "No games found on RAWG for “" + title + "”.";
    } catch (err) {
      store.results = [];
      showFormError(form, err.message);
    } finally {
      $("results").replaceChildren(...store.results.map(resultRow));
      setBusy(button, false);
    }
  });
}
