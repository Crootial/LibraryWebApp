// What the games page shares between its parts: the data on show and a few small helpers.

const HOME_HINT = "The games players have been adding to their libraries the most lately.";

const store = {
  user: null, // the signed-in account { id, username, createdAt }, or null for a visitor
  games: [],
  wishlist: [],
  trending: null, // stays null until the list has loaded
  filter: "",
  results: [],
  back: () => "home", // the tab that was open before Account (set by initTabs)
};

// Which cards have their Details dropdown open. The cards are redrawn whenever the list changes,
// and an open one should not snap shut.
const openCards = {
  games: new Set(),
  wishes: new Set(),
  results: new Set(),
  trending: new Set(),
};
const remember = (set, key) => (open) => (open ? set.add(key) : set.delete(key));

// A search or trending result is already in the collection when it has the same RAWG id or title.
const owned = (result) => store.games.some((g) => sameGame(g, result));

// The wishlist entry for a result, when it has one.
const wishOf = (result) => store.wishlist.find((item) => sameGame(item, result));

// Give a card the slam-in animation, then take the class off again so that switching tabs
// doesn't replay it.
function slamIn(card, i = 0) {
  card.classList.add("enter");
  card.style.setProperty("--i", i);
  card.addEventListener("animationend", (e) => {
    if (e.target === card) card.classList.remove("enter");
  });
}

// Put cards in a list, slamming them in one after another when asked to.
function drawCards(container, cards, enter) {
  if (enter) cards.forEach((card, i) => slamIn(card, i));
  container.replaceChildren(...cards);
}

// Grey placeholder cards while a list loads.
function showSkeletons(container, count) {
  container.replaceChildren(...Array.from({ length: count }, () => el("li", { class: "skeleton" })));
  container.setAttribute("aria-busy", "true");
}

// The number on a tab pops when it changes, so an add is noticed from the other tabs.
function setTabCount(badge, count) {
  const changed = badge.textContent !== String(count);
  badge.textContent = count;
  if (changed && badge.dataset.ready) {
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
  }
  badge.dataset.ready = "true";
}

// Saving a game needs an account. A visitor is sent to the Account tab, which brings them back
// to where they were once they have signed in.
function askToSignIn(message) {
  toast(message);
  location.hash = "account";
}

// Tell the person why something failed. A 401 is left out: the page has already said that the
// sign-in ended (see session-ended in account.js).
function showFailure(err) {
  if (err.status !== 401) toast(err.message, "error");
}

// Another tab may have changed things. Fetch both lists again, without the loading placeholders.
async function resync() {
  try {
    [store.games, store.wishlist] = await Promise.all([api("/api/games"), api("/api/wishlist")]);
    renderAll();
  } catch {
    // Whatever went wrong has already been shown.
  }
}

function actionFailed(err, button) {
  setBusy(button, false);
  showFailure(err);
  if (err.status === 404 || err.status === 409) resync(); // another tab got there first
}

// A button is disabled while its request runs, and then redrawn, which drops the keyboard focus.
// Note where the focus was, and give back the function that puts it back once the card's buttons
// are redrawn. If the button it was on is gone, the card's Details bar gets it.
function holdFocus(button) {
  if (document.activeElement !== button) return () => {};
  const card = button.closest("li");
  const at = [...button.parentElement.children].indexOf(button);
  return () => {
    const target = card.querySelector(".save-actions")?.children[at];
    (target && !target.disabled ? target : card.querySelector("summary"))?.focus();
  };
}

// Details that were already fetched for a result go along with it when it is saved.
async function withFetched(result) {
  const extra = detailsCache.has(result.rawg_id) ? await detailsCache.get(result.rawg_id).catch(() => null) : null;
  return { ...result, ...extra };
}
