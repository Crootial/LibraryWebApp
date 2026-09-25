// MyGames front end. Shared helpers first, then one setup function per page.

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

// A console icon from the sprite in icons.svg. It takes its colour from the surrounding text.
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
  const init = { method: options.method || "GET" };
  if (options.body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new Error("Can't reach the server. Is it running?");
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
// then put back whatever was inside, icons included.
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

// ---------- Platforms ----------

// The systems a game can be filed under, from /api/platforms: [{ id, name, abbr, brand }].
let platforms = [];

const platformOf = (id) =>
  platforms.find((p) => p.id === id) ||
  platforms.find((p) => p.id === "other") ||
  { id: "other", name: "Other", abbr: "Other", brand: "other" };

// Fill a form's platform tiles from the list and select one. The tiles are radio buttons,
// so the arrow keys move between them and screen readers announce them as a group.
function buildPicker(form, selected = "other") {
  const options = platforms.map((p) =>
    el("label", { class: "platform-option", "data-brand": p.brand, title: p.name },
      el("input", { type: "radio", name: "platform", value: p.id, "aria-label": p.name }),
      el("span", { class: "platform-tile" },
        icon(p.id),
        el("span", { class: "platform-abbr", text: p.abbr }),
      ),
    ));
  form.querySelector(".platform-grid").replaceChildren(...options);
  form.elements.platform.value = selected;
  form.querySelector(".platform-picker").disabled = false;
}

// ---------- Forms ----------

// Read the title, platform, developer and year of a form. Gives back { game } or { error, field }.
function readGame(form) {
  const title = form.elements.title.value.trim();
  const developer = form.elements.developer.value.trim();
  const year = form.elements.year.value.trim();
  const platform = form.elements.platform.value || "other";
  if (!title) return { error: "Give the game a title.", field: "title" };
  if (year && (!/^\d{1,4}$/.test(year) || Number(year) < 1 || Number(year) > MAX_YEAR)) {
    return { error: "Year should be a number between 1 and " + MAX_YEAR + ".", field: "year" };
  }
  return { game: { title, platform, developer, year: year ? Number(year) : null } };
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

  // A search result is already in the collection when the same title is filed under that platform.
  const owned = (result, platformId) =>
    games.some((g) => g.platform === platformId && g.title.trim().toLowerCase() === result.title.trim().toLowerCase());

  function showEmpty(title, text, action) {
    empty.querySelector("h3").textContent = title;
    empty.querySelector("p").textContent = text;
    const button = empty.querySelector("button");
    button.hidden = !action;
    button.onclick = action || null;
    empty.hidden = false;
  }

  function gameCard(game) {
    const platform = platformOf(game.platform);
    const deleteButton = el("button", {
      class: "btn btn-danger btn-sm",
      type: "button",
      text: "Delete",
      "aria-label": "Delete " + game.title,
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
      el("div", { class: "cover", "data-brand": platform.brand, "aria-hidden": "true" }, icon(platform.id)),
      el("div", {},
        el("h3", { class: "game-title", text: game.title }),
        el("p", { class: "game-meta", text: game.developer || "Unknown" }),
        el("p", { class: "tags" },
          el("span", { class: "chip chip-platform", text: platform.name }),
          game.year ? el("span", { class: "chip", text: game.year }) : null,
        ),
      ),
      el("div", { class: "actions" },
        el("a", {
          class: "btn btn-ghost btn-sm",
          href: "edit.html?id=" + encodeURIComponent(game.id),
          text: "Edit",
          "aria-label": "Edit " + game.title,
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
      .filter((g) => [g.title, g.developer, g.year, platformOf(g.platform).name].join(" ").toLowerCase().includes(q));

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
      [platforms, games] = await Promise.all([api("/api/platforms"), api("/api/games")]);
      buildPicker(addForm);
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
      toast("Removed “" + game.title + "”.");
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
    toast("Added “" + game.title + "” to your collection.");
  }

  // One result: what it is, then one button per platform it came out on.
  function resultRow(result) {
    const buttons = result.platforms.map((id) => {
      const platform = platformOf(id);
      const have = owned(result, id);
      const button = el("button", {
        class: "btn btn-ghost btn-sm",
        type: "button",
        title: have ? "Already in your collection" : "Add for " + platform.name,
        "aria-label": (have ? "Already in your collection: " : "Add ") + result.title + " for " + platform.name,
      }, icon(platform.id), el("span", { text: platform.abbr }));
      button.disabled = have;
      if (!have) button.addEventListener("click", () => addResult(result, id, button));
      return button;
    });
    return el("li", { class: "result" },
      el("p", { class: "result-title", text: result.title }),
      el("p", { class: "result-meta", text: [result.developer, result.year].filter(Boolean).join(" · ") }),
      el("div", { class: "result-add" },
        el("span", { class: "result-add-label", text: "Add for" }),
        ...buttons,
      ),
    );
  }

  function renderResults() {
    resultsList.replaceChildren(...results.map(resultRow));
  }

  async function addResult(result, platformId, button) {
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", {
        method: "POST",
        body: { title: result.title, platform: platformId, developer: result.developer, year: result.year ?? null },
      }));
    } catch (err) {
      setBusy(button, false);
      toast(err.message, "error");
    }
  }

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const check = readGame(addForm);
    if (check.error) return showFormError(addForm, check.error, check.field);
    const button = addForm.querySelector("button[type=submit]");
    setBusy(button, true, "Adding");
    try {
      collect(await api("/api/games", { method: "POST", body: check.game }));
      // Keep the platform: people usually add several games for the same system in a row.
      addForm.reset();
      addForm.elements.platform.value = check.game.platform;
      addForm.elements.title.focus();
    } catch (err) {
      showFormError(addForm, err.message);
    } finally {
      setBusy(button, false);
    }
  });

  lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = lookupForm.elements.search.value.trim();
    if (!title) return showFormError(lookupForm, "Type a title to search for.", "search");
    const button = lookupForm.querySelector("button[type=submit]");
    setBusy(button, true, "Searching");
    lookupStatus.textContent = "";
    try {
      results = await api("/api/lookup?title=" + encodeURIComponent(title));
      if (!results.length) lookupStatus.textContent = "No games found on Wikidata for “" + title + "”.";
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

  watchForm(addForm);
  watchForm(lookupForm);

  const flash = takeFlash();
  if (flash) toast(flash);
  load();
}

// ---------- Edit page ----------

function initEdit() {
  const id = new URLSearchParams(location.search).get("id");
  const form = $("edit-form");
  const state = $("edit-state");

  function showState(title, text) {
    state.querySelector("h3").textContent = title;
    state.querySelector("p").textContent = text;
    state.hidden = false;
    form.hidden = true;
  }

  async function loadGame() {
    if (!id) return showState("No game chosen", "Pick a game from your collection and press Edit.");
    try {
      let games;
      [platforms, games] = await Promise.all([api("/api/platforms"), api("/api/games")]);
      const game = games.find((g) => String(g.id) === id);
      if (!game) return showState("Game not found", "It may have been deleted from your collection.");
      buildPicker(form, game.platform);
      form.elements.title.value = game.title;
      form.elements.developer.value = game.developer || "";
      form.elements.year.value = game.year || "";
      $("edit-name").textContent = game.title;
      document.title = "Edit " + game.title + " · MyGames";
      state.hidden = true;
      form.hidden = false;
      form.elements.title.focus();
    } catch (err) {
      showState("Couldn't load this game", err.message);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const check = readGame(form);
    if (check.error) return showFormError(form, check.error, check.field);
    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Saving");
    try {
      const game = await api("/api/games/" + encodeURIComponent(id), { method: "PUT", body: check.game });
      setFlash("Saved changes to “" + game.title + "”.");
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
