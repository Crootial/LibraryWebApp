function wishCard(item) {
  const title = item.title || "Untitled game";
  const moveButton = el("button", {
    class: "btn btn-primary btn-sm",
    type: "button",
    text: "Move to collection",
    "aria-label": "Move to your collection: " + title,
  });
  const removeButton = el("button", {
    class: "btn btn-ghost btn-sm",
    type: "button",
    text: "Remove",
    "aria-label": "Remove from your wishlist: " + title,
  });
  moveButton.addEventListener("click", () => moveWish(item, moveButton));
  removeButton.addEventListener("click", () => removeWish(item, removeButton));

  return el("li", { class: "game game-wish", "data-id": item.id },
    cover(item),
    cardBody(item),
    el("div", { class: "actions" }, moveButton, removeButton),
    detailsPanel(item, {
      isOpen: openCards.wishes.has(item.id),
      onToggle: remember(openCards.wishes, item.id),
    }),
  );
}

function renderWishlist(enter = false) {
  setTabCount($("wish-count"), store.wishlist.length);
  const cards = [...store.wishlist].sort((a, b) => b.id - a.id).map(wishCard);
  drawCards($("wishlist"), cards, enter);

  const empty = $("wishlist-empty");
  if (cards.length) empty.hidden = true;
  else if (!isMember()) fillEmpty(empty, { title: "Sign in to keep a wishlist", text: "Save the games you want to play next.", links: SIGN_IN_LINKS });
  else fillEmpty(empty, {
    title: "Your wishlist is empty",
    text: "Tap the heart on a game to save it for later.",
    links: [{ text: "See what's trending", href: "#home", primary: true }, { text: "Look up online", href: "#lookup" }],
  });
}

async function loadWishlist() {
  const list = $("wishlist");
  showSkeletons(list, 2);
  $("wishlist-empty").hidden = true;
  try {
    store.wishlist = await api("/api/wishlist");
    store.loaded.wishlist = true;
    renderWishlist(true);
    renderBrowse();
    renderAccount();
  } catch (err) {
    list.replaceChildren();
    if (err.status !== 401) {
      store.loaded.wishlist = "failed";
      fillEmpty($("wishlist-empty"), { title: "Couldn't load your wishlist", text: err.message, retry: loadWishlist });
      renderAccount();
    }
  } finally {
    list.removeAttribute("aria-busy");
  }
}

async function toggleWish(result, button) {
  if (!isMember()) return askToSignIn("Sign in to keep a wishlist.");
  const existing = wishOf(result);
  const restoreFocus = holdFocus(button);
  setBusy(button, true, existing ? "Removing" : "Saving");
  try {
    if (existing) {
      await api("/api/wishlist/" + encodeURIComponent(existing.id), { method: "DELETE" });
      store.wishlist = store.wishlist.filter((item) => item !== existing);
      toast("Removed “" + result.title + "” from your wishlist.");
    } else {
      store.wishlist.push(await api("/api/wishlist", { method: "POST", body: await withFetched(result) }));
      toast("Added “" + result.title + "” to your wishlist.");
    }
    renderAll();
    restoreFocus();
  } catch (err) {
    actionFailed(err, button);
  }
}

async function moveWish(item, button) {
  setBusy(button, true, "Moving");
  try {
    const game = await api("/api/wishlist/" + encodeURIComponent(item.id) + "/collect", { method: "POST" });
    collect(game, "Moved “" + (game.title || "Untitled game") + "” to your collection.");
  } catch (err) {
    actionFailed(err, button);
  }
}

async function removeWish(item, button) {
  setBusy(button, true, "Removing");
  try {
    await api("/api/wishlist/" + encodeURIComponent(item.id), { method: "DELETE" });
    store.wishlist = store.wishlist.filter((w) => w !== item);
    renderAll();
    toast("Removed “" + (item.title || "Untitled game") + "” from your wishlist.");
  } catch (err) {
    actionFailed(err, button);
  }
}
