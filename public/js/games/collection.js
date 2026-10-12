// A saved game keeps the RAWG details its card fetched, so they load from the server next time
function keepDetails(game, extra) {
  const fresh = Object.fromEntries(Object.entries(extra).filter(([key]) => game[key] === undefined));
  Object.assign(game, fresh);
  api("/api/games/" + encodeURIComponent(game.id), { method: "PUT", body: fresh }).catch(() => {});
}

function gameCard(game) {
  const title = game.title || "Untitled game";
  return el("li", { class: "game", "data-id": game.id },
    cover(game),
    cardBody(game),
    el("div", { class: "actions" },
      el("a", { class: "btn btn-ghost btn-sm", href: "edit.html?id=" + encodeURIComponent(game.id), text: "Edit", "aria-label": "Edit " + title }),
      confirmButton({ class: "btn btn-danger btn-sm", text: "Delete", "aria-label": "Delete " + title }, (button) => removeGame(game, button)),
    ),
    detailsPanel(game, {
      isOpen: openCards.games.has(game.id),
      onToggle: remember(openCards.games, game.id),
      onLoaded: (extra) => keepDetails(game, extra),
    }),
  );
}

// "Filter your games" looks in the title, platforms, genres, developers, publishers and year. Newest first.
function visibleGames() {
  const q = store.filter.trim().toLowerCase();
  return [...store.games].sort((a, b) => b.id - a.id).filter((g) => [
    g.title,
    platformNames(g).join(" "),
    platformTags(g).map((t) => t.title).join(" "),
    genresOf(g).join(" "),
    listOf(g.developers).join(" "),
    listOf(g.publishers).join(" "),
    yearOf(g),
  ].join(" ").toLowerCase().includes(q));
}

function renderCollection(enter = false) {
  const shown = visibleGames();
  const count = store.games.length;
  $("count-num").textContent = count;
  $("count-label").textContent = count === 1 ? "game" : "games";
  setTabCount($("tab-count"), count);
  drawCards($("games"), shown.map(gameCard), enter);

  const empty = $("games-empty");
  if (shown.length) empty.hidden = true;
  else if (!isMember()) fillEmpty(empty, { title: "Sign in to see your games", text: "Your collection is saved to your account.", links: SIGN_IN_LINKS });
  else if (count) fillEmpty(empty, { title: "No matches", text: "Nothing in your collection matches “" + store.filter.trim() + "”." });
  else fillEmpty(empty, {
    title: "Your collection is empty",
    text: "Search RAWG for a game, or add one yourself.",
    links: [{ text: "Look up online", href: "#lookup", primary: true }, { text: "Add a game", href: "#add" }],
  });
}

async function removeGame(game, button) {
  button.disabled = true;
  try {
    await api("/api/games/" + encodeURIComponent(game.id), { method: "DELETE" });
    store.games = store.games.filter((g) => g.id !== game.id);
    renderAll();
    toast("Removed “" + (game.title || "Untitled game") + "”.");
  } catch (err) {
    button.disabled = false;
    showFailure(err);
  }
}

// Shows a game the server has just put in the collection (it leaves the wishlist at the same time)
function collect(game, message = "Added “" + (game.title || "Untitled game") + "” to your collection.") {
  store.games = [...store.games.filter((g) => g.id !== game.id), game];
  store.wishlist = store.wishlist.filter((item) => !sameGame(item, game));
  renderAll();
  const card = $("games").querySelector('[data-id="' + game.id + '"]');
  if (card) slamIn(card);
  toast(message);
}

function initAddForm() {
  const form = $("add-form");
  buildPicker(form);
  onSubmit(form, async () => {
    const check = readForm(form);
    if (check.error) return showFormError(form, check.error, check.field);
    const { title, platformIds, rating, year, developers, publishers } = check.values;
    const body = { title, platforms: platformIds.map((id) => platformById(id).name) };
    if (rating != null) body.rating = rating;
    if (year != null) body.released = String(year);
    if (developers.length) body.developers = developers;
    if (publishers.length) body.publishers = publishers;

    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", { method: "POST", body }));
      form.reset();
      checkPlatforms(form, platformIds); // the next game is often on the same systems
      form.elements.title.focus();
    } catch (err) {
      showFormError(form, err.message);
    } finally {
      setBusy(button, false);
    }
  });
}

function initFilter() {
  $("filter").addEventListener("input", (e) => {
    store.filter = e.target.value;
    renderCollection();
  });
}
