// MyGameVault front end. Shared helpers first, then one setup function per page.
//
// The API stores a game as { id, title, platforms: [names], rating, released, image, genres, rawg_id }.
// Games added by hand carry fewer of those, so every reader below copes with missing fields.

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const MAX_YEAR = new Date().getFullYear() + 1;

// Build an element from text and child elements, never from HTML strings,
// so a game title can't inject markup into the page.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

// An icon from the sprite in icons.svg. It takes its colour from the surrounding text.
function icon(id) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "icons.svg#" + id);
  svg.append(use);
  return svg;
}

// Call the API and hand back the JSON. Failures become an Error with a readable message.
async function api(path, options = {}) {
  const init = { method: options.method || "GET", signal: AbortSignal.timeout(20000) };
  if (options.body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new Error(err.name === "TimeoutError"
      ? "The server took too long to answer. Try again."
      : "Can't reach the server. Is it running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong (" + res.status + ").");
  return data;
}

function toast(message, type = "ok") {
  const node = el("div", { class: "toast " + type, text: message });
  $("toasts").append(node);
  setTimeout(() => {
    node.classList.add("leaving");
    node.addEventListener("animationend", () => node.remove(), { once: true });
  }, type === "error" ? 5500 : 3200);
}

// A message that survives a page change, for "Saved" after leaving the edit page.
function setFlash(message) {
  try { sessionStorage.setItem("flash", message); } catch {}
}

function takeFlash() {
  try {
    const message = sessionStorage.getItem("flash");
    sessionStorage.removeItem("flash");
    return message;
  } catch {
    return null;
  }
}

// Swap a button's contents for a label and spinner while a request is running,
// then put back whatever was inside.
const idleContents = new WeakMap();
function setBusy(button, busy, busyLabel) {
  if (busy) {
    if (!idleContents.has(button)) idleContents.set(button, [...button.childNodes]);
    button.textContent = busyLabel;
  } else if (idleContents.has(button)) {
    button.replaceChildren(...idleContents.get(button));
    idleContents.delete(button);
  }
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
}

// ---------- Reading a game ----------

// The platform names saved on a game, however they were stored: a list, a bare string, [""] from
// an empty box, or one box holding several names ("PC, PS5"). RAWG's own names have no commas.
function platformNames(game) {
  const list = Array.isArray(game.platforms) ? game.platforms : [game.platforms];
  return list.flatMap((entry) => String(entry ?? "").split(",")).map((name) => name.trim()).filter(Boolean);
}

// What to draw for a game's platforms: one entry per system we know (PS4 and PS5 both
// become PlayStation), and one per name we don't.
function platformTags(game) {
  const tags = [];
  const seen = new Set();
  for (const name of platformNames(game)) {
    const known = platformFor(name);
    const key = known ? known.id : "other:" + name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(known
      ? { platform: known, label: known.abbr, title: known.name }
      : { platform: platformById("other"), label: name, title: name });
  }
  return tags;
}

// RAWG sends 0 or "N/A" for a game nobody has rated.
function ratingOf(game) {
  const n = parseFloat(game.rating);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// released is "2020-12-10", "2017" (typed by hand) or "N/A".
function yearOf(game) {
  const match = /^\d{4}/.exec(String(game.released ?? "").trim());
  return match ? Number(match[0]) : null;
}

const genresOf = (game) =>
  Array.isArray(game.genres) ? game.genres.filter((g) => typeof g === "string" && g) : [];

const imageOf = (game) =>
  typeof game.image === "string" && /^https?:\/\//i.test(game.image) ? game.image : null;

// RAWG will serve a smaller copy of its pictures, which loads faster than the full size.
const artUrl = (url) =>
  url.startsWith("https://media.rawg.io/media/") && !url.includes("/media/crop/")
    ? url.replace("/media/", "/media/crop/600/400/")
    : url;

// ---------- Pieces of a card ----------

// The picture on a card: RAWG's art when there is some, laid over a tile holding the game's
// console icon. If the art won't load the tile shows through instead.
function cover(game, small = false) {
  const first = platformTags(game)[0];
  const platform = first ? first.platform : platformById("other");
  const tile = el("div", {
    class: "cover" + (small ? " cover-sm" : ""),
    "data-brand": platform.brand,
    "aria-hidden": "true",
  }, icon(platform.id));
  const image = imageOf(game);
  if (image) {
    const art = el("img", { src: artUrl(image), alt: "", loading: "lazy", decoding: "async" });
    art.addEventListener("error", () => {
      if (art.src !== image) art.src = image; // the resized copy failed, so try the original
      else art.remove();
    });
    tile.append(art);
  }
  return tile;
}

function platformChip(tag) {
  return el("span", { class: "chip chip-platform", title: tag.title },
    icon(tag.platform.id),
    el("span", { text: tag.label }),
  );
}

function ratingChip(rating) {
  return el("span", { class: "chip chip-rating", title: "Rating out of 5" },
    icon("star"),
    el("span", { text: rating.toFixed(1) }),
  );
}

// ---------- Platform picker ----------

// Fill a form's platform tiles. Each tile is a checkbox underneath, so it works with the
// keyboard and screen readers, and a game can sit on as many platforms as it needs.
function buildPicker(form, selected = []) {
  const options = PLATFORMS.map((p) =>
    el("label", { class: "platform-option", "data-brand": p.brand, title: p.name },
      el("input", { type: "checkbox", name: "platform", value: p.id, "aria-label": p.name }),
      el("span", { class: "platform-tile" },
        icon(p.id),
        el("span", { class: "platform-abbr", text: p.abbr }),
      ),
    ));
  form.querySelector(".platform-grid").replaceChildren(...options);
  checkPlatforms(form, selected);
}

function checkPlatforms(form, ids) {
  for (const box of form.querySelectorAll("input[name=platform]")) box.checked = ids.includes(box.value);
}

const checkedPlatforms = (form) =>
  [...form.querySelectorAll("input[name=platform]:checked")].map((box) => box.value);

// The systems on a game that have a tile in the picker. Names we don't recognise have none.
const knownPlatformIds = (game) =>
  [...new Set(platformNames(game).map((name) => platformFor(name)).filter(Boolean).map((p) => p.id))];

// ---------- Forms ----------

// Read a game form. Gives back { values } or { error, field }.
function readForm(form) {
  const title = form.elements.title.value.trim();
  const rating = form.elements.rating.value.trim();
  const year = form.elements.year.value.trim();
  if (!title) return { error: "Give the game a title.", field: "title" };
  if (rating && (!/^\d(\.\d{1,2})?$/.test(rating) || Number(rating) > 5)) {
    return { error: "Rating should be a number from 0 to 5, like 4.5.", field: "rating" };
  }
  if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > MAX_YEAR)) {
    return { error: "Year should be a number between 1 and " + MAX_YEAR + ".", field: "year" };
  }
  return {
    values: {
      title,
      platformIds: checkedPlatforms(form),
      rating: rating ? Number(rating) : null,
      year: year ? Number(year) : null,
    },
  };
}

function clearFormError(form) {
  form.querySelector(".form-error").hidden = true;
  for (const input of form.querySelectorAll("input")) input.removeAttribute("aria-invalid");
}

function showFormError(form, message, field) {
  clearFormError(form);
  const box = form.querySelector(".form-error");
  box.textContent = message;
  box.hidden = false;
  if (field) {
    form.elements[field].setAttribute("aria-invalid", "true");
    form.elements[field].focus();
  }
}

// Clear the error as soon as the person starts typing again.
function watchForm(form) {
  form.addEventListener("input", () => clearFormError(form));
}

// ---------- Games page ----------

function initGames() {
  const list = $("games");
  const empty = $("games-empty");
  const addForm = $("add-form");
  const lookupForm = $("lookup-form");
  const resultsList = $("results");
  const lookupStatus = $("lookup-status");
  let games = [];
  let filter = "";
  let results = [];

  // A search result is already in the collection when it has the same RAWG id or the same title.
  const owned = (result) =>
    games.some((g) =>
      (g.rawg_id && g.rawg_id === result.rawg_id) ||
      (g.title && g.title.trim().toLowerCase() === result.title.trim().toLowerCase()));

  function showEmpty(title, text, action) {
    empty.querySelector("h3").textContent = title;
    empty.querySelector("p").textContent = text;
    const button = empty.querySelector("button");
    button.hidden = !action;
    button.onclick = action || null;
    empty.hidden = false;
  }

  function gameCard(game) {
    const title = game.title || "Untitled game";
    const rating = ratingOf(game);
    const year = yearOf(game);
    const genres = genresOf(game);
    const deleteButton = el("button", {
      class: "btn btn-danger btn-sm",
      type: "button",
      text: "Delete",
      "aria-label": "Delete " + title,
    });
    // Delete asks twice: the first click arms the button, the second one confirms.
    let disarm;
    deleteButton.addEventListener("click", () => {
      if (deleteButton.dataset.armed === "true") {
        clearTimeout(disarm);
        removeGame(game, deleteButton);
        return;
      }
      deleteButton.dataset.armed = "true";
      deleteButton.textContent = "Sure?";
      disarm = setTimeout(() => {
        deleteButton.dataset.armed = "false";
        deleteButton.textContent = "Delete";
      }, 4000);
    });

    return el("li", { class: "game", "data-id": game.id },
      cover(game),
      el("div", { class: "game-body" },
        el("h3", { class: "game-title", text: title }),
        genres.length ? el("p", { class: "game-meta", text: genres.slice(0, 3).join(" · ") }) : null,
        el("p", { class: "tags" },
          rating ? ratingChip(rating) : null,
          year ? el("span", { class: "chip", text: year }) : null,
          ...platformTags(game).map(platformChip),
        ),
      ),
      el("div", { class: "actions" },
        el("a", {
          class: "btn btn-ghost btn-sm",
          href: "edit.html?id=" + encodeURIComponent(game.id),
          text: "Edit",
          "aria-label": "Edit " + title,
        }),
        deleteButton,
      ),
    );
  }

  // Draw the collection. Pass true to slam the cards in one after another.
  function render(enter = false) {
    const q = filter.trim().toLowerCase();
    const shown = [...games]
      .sort((a, b) => b.id - a.id)
      .filter((g) => [
        g.title,
        platformNames(g).join(" "),
        platformTags(g).map((t) => t.title).join(" "),
        genresOf(g).join(" "),
        yearOf(g),
      ].join(" ").toLowerCase().includes(q));

    $("count-num").textContent = games.length;
    $("count-label").textContent = games.length === 1 ? "game" : "games";

    const cards = shown.map(gameCard);
    if (enter) {
      cards.forEach((card, i) => {
        card.classList.add("enter");
        card.style.setProperty("--i", i);
      });
    }
    list.replaceChildren(...cards);

    if (shown.length) empty.hidden = true;
    else if (games.length) showEmpty("No matches", "Nothing in your collection matches “" + filter.trim() + "”.");
    else showEmpty("Your collection is empty", "Add your first game with the form, or look one up online.");
  }

  async function load() {
    list.replaceChildren(...[0, 1, 2].map(() => el("li", { class: "skeleton" })));
    list.setAttribute("aria-busy", "true");
    empty.hidden = true;
    try {
      games = await api("/api/games");
      render(true);
    } catch (err) {
      list.replaceChildren();
      showEmpty("Couldn't load your games", err.message, load);
    } finally {
      list.removeAttribute("aria-busy");
    }
  }

  async function removeGame(game, button) {
    button.disabled = true;
    try {
      await api("/api/games/" + encodeURIComponent(game.id), { method: "DELETE" });
      games = games.filter((g) => g.id !== game.id);
      render();
      renderResults();
      toast("Removed “" + (game.title || "Untitled game") + "”.");
    } catch (err) {
      button.disabled = false;
      toast(err.message, "error");
    }
  }

  // Put a new game in the collection and make just that card slam in.
  function collect(game) {
    games.push(game);
    render();
    renderResults();
    list.querySelector('[data-id="' + game.id + '"]')?.classList.add("enter");
    toast("Added “" + (game.title || "Untitled game") + "” to your collection.");
  }

  // One search result: its art, what it is, the systems it is on, and a button to keep it.
  function resultRow(result) {
    const have = owned(result);
    const button = el("button", {
      class: "btn btn-primary btn-sm",
      type: "button",
      text: have ? "In collection" : "Add to collection",
      "aria-label": (have ? "Already in your collection: " : "Add to your collection: ") + result.title,
    });
    button.disabled = have;
    if (!have) button.addEventListener("click", () => addResult(result, button));

    const rating = ratingOf(result);
    const facts = [yearOf(result), rating && rating.toFixed(1) + " / 5"].filter(Boolean).join(" · ");
    return el("li", { class: "result" },
      cover(result, true),
      el("div", { class: "result-body" },
        el("p", { class: "result-title", text: result.title }),
        facts ? el("p", { class: "result-meta", text: facts }) : null,
        el("p", { class: "tags" }, ...platformTags(result).map(platformChip)),
        button,
      ),
    );
  }

  function renderResults() {
    resultsList.replaceChildren(...results.map(resultRow));
  }

  // The backend keeps whatever it is sent, so a search result is saved exactly as it came back.
  async function addResult(result, button) {
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", { method: "POST", body: result }));
    } catch (err) {
      setBusy(button, false);
      toast(err.message, "error");
    }
  }

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(addForm);
    const check = readForm(addForm);
    if (check.error) return showFormError(addForm, check.error, check.field);
    const { title, platformIds, rating, year } = check.values;
    const body = { title, platforms: platformIds.map((id) => platformById(id).name) };
    if (rating != null) body.rating = rating;
    if (year != null) body.released = String(year);

    const button = addForm.querySelector("button[type=submit]");
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", { method: "POST", body }));
      // Keep the platforms: people usually add several games for the same system in a row.
      addForm.reset();
      checkPlatforms(addForm, platformIds);
      addForm.elements.title.focus();
    } catch (err) {
      showFormError(addForm, err.message);
    } finally {
      setBusy(button, false);
    }
  });

  lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(lookupForm);
    const title = lookupForm.elements.search.value.trim();
    if (!title) return showFormError(lookupForm, "Type a title to search for.", "search");
    const button = lookupForm.querySelector("button[type=submit]");
    setBusy(button, true, "Searching");
    lookupStatus.textContent = "";
    try {
      results = await api("/api/lookup?title=" + encodeURIComponent(title));
      if (!results.length) lookupStatus.textContent = "No games found on RAWG for “" + title + "”.";
    } catch (err) {
      results = [];
      showFormError(lookupForm, err.message);
    } finally {
      renderResults();
      setBusy(button, false);
    }
  });

  $("filter").addEventListener("input", (e) => {
    filter = e.target.value;
    render();
  });

  buildPicker(addForm);
  watchForm(addForm);
  watchForm(lookupForm);

  const flash = takeFlash();
  if (flash) toast(flash);
  load();
}

// ---------- Edit page ----------

// A game's platform names after its tiles were changed. Names for systems that are still ticked
// stay as they were ("PlayStation 5" stays "PlayStation 5"), unticked ones go, names we don't
// recognise are left alone, and newly ticked systems get their tile's name.
function platformsAfterEdit(game, ids) {
  const names = platformNames(game);
  const keep = names.filter((name) => {
    const known = platformFor(name);
    return !known || ids.includes(known.id);
  });
  const had = new Set(names.map((name) => (platformFor(name) || {}).id));
  const added = ids.filter((id) => !had.has(id)).map((id) => platformById(id).name);
  return [...keep, ...added];
}

function initEdit() {
  const id = new URLSearchParams(location.search).get("id");
  const form = $("edit-form");
  const state = $("edit-state");
  let original;

  function showState(title, text) {
    state.querySelector("h3").textContent = title;
    state.querySelector("p").textContent = text;
    state.hidden = false;
    form.hidden = true;
  }

  async function loadGame() {
    if (!id) return showState("No game chosen", "Pick a game from your collection and press Edit.");
    try {
      const games = await api("/api/games");
      original = games.find((g) => String(g.id) === id);
      if (!original) return showState("Game not found", "It may have been deleted from your collection.");
      const title = original.title || "Untitled game";
      buildPicker(form, knownPlatformIds(original));
      form.elements.title.value = original.title || "";
      form.elements.rating.value = ratingOf(original) ?? "";
      form.elements.year.value = yearOf(original) ?? "";
      $("edit-name").textContent = title;
      document.title = "Edit " + title + " · MyGameVault";
      state.hidden = true;
      form.hidden = false;
      form.elements.title.focus();
    } catch (err) {
      showState("Couldn't load this game", err.message);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(form);
    const check = readForm(form);
    if (check.error) return showFormError(form, check.error, check.field);
    const { title, platformIds, rating, year } = check.values;

    // Send only what changed. The backend merges it into the saved game, so the RAWG id, the
    // picture, the genres and the full release date are never lost by editing the title.
    const changes = { title };
    const before = knownPlatformIds(original);
    const sameSystems = before.length === platformIds.length && platformIds.every((pid) => before.includes(pid));
    if (!sameSystems) changes.platforms = platformsAfterEdit(original, platformIds);
    if (rating !== ratingOf(original)) changes.rating = rating;
    if (year !== yearOf(original)) changes.released = year == null ? null : String(year);

    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Saving");
    try {
      const game = await api("/api/games/" + encodeURIComponent(id), { method: "PUT", body: changes });
      setFlash("Saved changes to “" + (game.title || "Untitled game") + "”.");
      window.location.href = "index.html";
    } catch (err) {
      setBusy(button, false);
      showFormError(form, err.message);
    }
  });

  watchForm(form);
  loadGame();
}

const pages = { games: initGames, edit: initEdit };
pages[document.body.dataset.page]?.();
