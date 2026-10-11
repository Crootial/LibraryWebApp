const HOME_HINT = "The games players have been adding to their libraries the most lately.";

const store = {
  user: null,
  games: [],
  wishlist: [],
  trending: null,
  filter: "",
  results: [],
  returnTo: null,
  back: () => "home",
};

const openCards = {
  games: new Set(),
  wishes: new Set(),
  results: new Set(),
  trending: new Set(),
};
const remember = (set, key) => (open) => (open ? set.add(key) : set.delete(key));

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
  if (enter) cards.forEach((card, i) => slamIn(card, i));
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
    void badge.offsetWidth;
    badge.classList.add("bump");
  }
  badge.dataset.ready = "true";
}

function askToSignIn(message) {
  toast(message);
  location.hash = "account";
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

// Retain keyboard focus across button re-renders
function holdFocus(button) {
  if (document.activeElement !== button) return () => {};
  const card = button.closest("li");
  const at = [...button.parentElement.children].indexOf(button);
  return () => {
    const target = card.querySelector(".save-actions")?.children[at];
    (target && !target.disabled ? target : card.querySelector("summary"))?.focus();
  };
}

async function withFetched(result) {
  const extra = detailsCache.has(result.rawg_id) ? await detailsCache.get(result.rawg_id).catch(() => null) : null;
  return { ...result, ...extra };
}
