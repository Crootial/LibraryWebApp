async function keepDetails(game, extra) {
  const fresh = {};
  for (const [key, value] of Object.entries(extra)) {
    if (game[key] === undefined) fresh[key] = value;
  }
  Object.assign(game, fresh);
  try {
    await api("/api/games/" + encodeURIComponent(game.id), { method: "PUT", body: fresh });
  } catch {}
}

// Two-step confirmation for destructive delete
function armedDelete(game, title) {
  const button = el("button", {
    class: "btn btn-danger btn-sm",
    type: "button",
    text: "Delete",
    "aria-label": "Delete " + title,
  });
  let disarm;
  button.addEventListener("click", () => {
    if (button.dataset.armed === "true") {
      clearTimeout(disarm);
      removeGame(game, button);
      return;
    }
    button.dataset.armed = "true";
    button.textContent = "Sure?";
    disarm = setTimeout(() => {
      button.dataset.armed = "false";
      button.textContent = "Delete";
    }, 4000);
  });
  return button;
}

function gameCard(game) {
  const title = game.title || "Untitled game";
  return el("li", { class: "game", "data-id": game.id },
    cover(game),
    cardBody(game),
    el("div", { class: "actions" },
      el("a", {
        class: "btn btn-ghost btn-sm",
        href: "edit.html?id=" + encodeURIComponent(game.id),
        text: "Edit",
        "aria-label": "Edit " + title,
      }),
      armedDelete(game, title),
    ),
    detailsPanel(game, {
      isOpen: openCards.games.has(game.id),
      onToggle: remember(openCards.games, game.id),
      onLoaded: (extra) => keepDetails(game, extra),
    }),
  );
}

function visibleGames() {
  const q = store.filter.trim().toLowerCase();
  return [...store.games]
    .sort((a, b) => b.id - a.id)
    .filter((g) => [
      g.title,
      platformNames(g).join(" "),
      platformTags(g).map((t) => t.title).join(" "),
      genresOf(g).join(" "),
      listOf(g.developers).join(" "),
      listOf(g.publishers).join(" "),
      yearOf(g),
    ].join(" ").toLowerCase().includes(q));
}

function fillCollectionEmpty(empty) {
  if (!isMember()) {
    fillEmpty(empty, { title: "Sign in to see your games", text: "Your collection is saved to your account.", links: SIGN_IN_LINKS });
  } else if (store.games.length) {
    fillEmpty(empty, { title: "No matches", text: "Nothing in your collection matches “" + store.filter.trim() + "”." });
  } else {
    fillEmpty(empty, {
      title: "Your collection is empty",
      text: "Search RAWG for a game, or add one yourself.",
      links: [{ text: "Look up online", href: "#lookup", primary: true }, { text: "Add a game", href: "#add" }],
    });
  }
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
  else fillCollectionEmpty(empty);
}

async function loadGames() {
  const list = $("games");
  showSkeletons(list, 3);
  $("games-empty").hidden = true;
  try {
    store.games = await api("/api/games");
    store.loaded.games = true;
    renderCollection(true);
    renderBrowse();
    renderAccount();
  } catch (err) {
    list.replaceChildren();
    if (err.status !== 401) {
      store.loaded.games = "failed";
      fillEmpty($("games-empty"), { title: "Couldn't load your games", text: err.message, retry: loadGames });
      renderAccount();
    }
  } finally {
    list.removeAttribute("aria-busy");
  }
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

function collect(game, message = "Added “" + (game.title || "Untitled game") + "” to your collection.") {
  store.games = [...store.games.filter((g) => g.id !== game.id), game];
  store.wishlist = store.wishlist.filter((item) => !sameGame(item, game));
  renderAll();
  const card = $("games").querySelector('[data-id="' + game.id + '"]');
  if (card) slamIn(card);
  toast(message);
}

function initAddForm() {
  const addForm = $("add-form");
  buildPicker(addForm);
  watchForm(addForm);

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(addForm);
    const check = readForm(addForm);
    if (check.error) return showFormError(addForm, check.error, check.field);
    const { title, platformIds, rating, year, developers, publishers } = check.values;
    const body = { title, platforms: platformIds.map((id) => platformById(id).name) };
    if (rating != null) body.rating = rating;
    if (year != null) body.released = String(year);
    if (developers.length) body.developers = developers;
    if (publishers.length) body.publishers = publishers;

    const button = addForm.querySelector("button[type=submit]");
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", { method: "POST", body }));
      addForm.reset();
      checkPlatforms(addForm, platformIds);
      addForm.elements.title.focus();
    } catch (err) {
      showFormError(addForm, err.message);
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
