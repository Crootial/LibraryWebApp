const store = {
  user: null,
  games: [],
  wishlist: [],
  trending: null,
  filter: "",
  results: [],
  friends: { friends: [], incoming: [], outgoing: [] },
  // Whether the collection, wishlist and friends have arrived: false, true, or "failed". The profile waits on them.
  loaded: { games: false, wishlist: false, friends: false },
  returnTo: null,
  back: () => "home",
};

// Which cards have their details open, so a redraw keeps them open
const openCards = { games: new Set(), wishes: new Set(), results: new Set(), trending: new Set() };
const remember = (set, key) => (open) => (open ? set.add(key) : set.delete(key));

const isMember = () => Boolean(store.user && !store.user.isGuest);
const owned = (result) => store.games.some((g) => sameGame(g, result));
const wishOf = (result) => store.wishlist.find((item) => sameGame(item, result));

function slamIn(card, i = 0) {
  card.classList.add("enter");
  card.style.setProperty("--i", i);
  card.addEventListener("animationend", (e) => {
    if (e.target === card) card.classList.remove("enter");
  });
}

function drawCards(container, cards, enter) {
  if (enter) cards.forEach(slamIn);
  container.replaceChildren(...cards);
}

function showSkeletons(container, count) {
  container.replaceChildren(...Array.from({ length: count }, () => el("li", { class: "skeleton" })));
  container.setAttribute("aria-busy", "true");
}

function setTabCount(badge, count) {
  const changed = badge.textContent !== String(count);
  badge.textContent = count;
  if (changed && badge.dataset.ready) {
    badge.classList.remove("bump");
    void badge.offsetWidth; // restart the animation
    badge.classList.add("bump");
  }
  badge.dataset.ready = "true";
}

// Loads the collection ("games") or the wishlist into the store and draws it
async function loadList(kind) {
  const list = $(kind);
  showSkeletons(list, kind === "games" ? 3 : 2);
  $(kind + "-empty").hidden = true;
  try {
    store[kind] = await api("/api/" + kind);
    store.loaded[kind] = true;
    (kind === "games" ? renderCollection : renderWishlist)(true);
    renderBrowse();
    renderAccount();
  } catch (err) {
    list.replaceChildren();
    if (err.status === 401) return;
    store.loaded[kind] = "failed";
    fillEmpty($(kind + "-empty"), { title: "Couldn't load your " + kind, text: err.message, retry: () => loadList(kind) });
    renderAccount();
  } finally {
    list.removeAttribute("aria-busy");
  }
}

function askToSignIn(message) {
  toast(message);
  location.hash = "account";
}

// Send someone to sign in, and bring them back to this page once they have
function signInThenReturn(message) {
  store.returnTo = location.hash;
  askToSignIn(message);
}

// Leaving the sign-in page for anywhere else drops the "take me back" note
window.addEventListener("tab-shown", (e) => {
  if (e.detail?.name !== "account") store.returnTo = null;
});

// The username in an address like #user:Name, or "" if there is none
function usernameIn(hash) {
  try {
    return decodeURIComponent(String(hash).replace(/^#/, "").split(":")[1] || "");
  } catch {
    return "";
  }
}

function showFailure(err) {
  if (err.status !== 401) toast(err.message, "error");
}

async function resync() {
  try {
    [store.games, store.wishlist] = await Promise.all([api("/api/games"), api("/api/wishlist")]);
    renderAll();
  } catch {}
}

function actionFailed(err, button) {
  setBusy(button, false);
  showFailure(err);
  if (err.status === 404 || err.status === 409) resync();
}

// Puts the keyboard back on the same button (or the card's details bar) after the card is redrawn
function holdFocus(button) {
  const card = button.closest("li");
  if (document.activeElement !== button || !card) return () => {};
  const at = [...button.parentElement.children].indexOf(button);
  return () => {
    const target = card.querySelector(".save-actions")?.children[at];
    (target && !target.disabled ? target : card.querySelector("summary"))?.focus();
  };
}

// A search result with any RAWG details already fetched for it
async function withFetched(result) {
  const extra = detailsCache.has(result.rawg_id) ? await detailsCache.get(result.rawg_id).catch(() => null) : null;
  return { ...result, ...extra };
}
