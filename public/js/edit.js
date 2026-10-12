// The new platform list: names the tiles don't cover are kept, unticked tiles are dropped, new tiles are added
function platformsAfterEdit(game, ids) {
  const names = platformNames(game);
  const keep = names.filter((name) => !platformFor(name) || ids.includes(platformFor(name).id));
  const had = new Set(names.map((name) => platformFor(name)?.id));
  return [...keep, ...ids.filter((id) => !had.has(id)).map((id) => platformById(id).name)];
}

const sameList = (a, b) => a.length === b.length && a.every((item, i) => item === b[i]);

function initEdit() {
  const id = new URLSearchParams(location.search).get("id");
  const form = $("edit-form");
  let original;

  function showState(title, text, links) {
    fillEmpty($("edit-state"), { title, text, links });
    form.hidden = true;
  }

  async function loadGame() {
    if (!id) return showState("No game chosen", "Pick a game from your collection and press Edit.");
    try {
      original = (await api("/api/games")).find((g) => String(g.id) === id);
    } catch (err) {
      if (err.status !== 401) return showState("Couldn't load this game", err.message);
      return showState("Sign in to edit your games", "Your collection is saved to your account.", [
        { text: "Sign in", href: "index.html#account", primary: true },
      ]);
    }
    if (!original) return showState("Game not found", "It may have been deleted from your collection.");
    const title = original.title || "Untitled game";
    buildPicker(form, knownPlatformIds(original));
    form.elements.title.value = original.title || "";
    form.elements.rating.value = ratingOf(original) ?? "";
    form.elements.year.value = yearOf(original) ?? "";
    form.elements.developer.value = listOf(original.developers).join(", ");
    form.elements.publisher.value = listOf(original.publishers).join(", ");
    $("edit-name").textContent = title;
    document.title = "Edit " + title + " · MyGameVault";
    $("edit-state").hidden = true;
    form.hidden = false;
    form.elements.title.focus();
  }

  // Only the fields that changed are sent, so RAWG details the form doesn't show are kept
  onSubmit(form, async () => {
    const check = readForm(form);
    if (check.error) return showFormError(form, check.error, check.field);
    const { title, platformIds, rating, year, developers, publishers } = check.values;
    const changes = { title };
    const before = knownPlatformIds(original);
    if (before.length !== platformIds.length || !platformIds.every((pid) => before.includes(pid))) {
      changes.platforms = platformsAfterEdit(original, platformIds);
    }
    if (rating !== ratingOf(original)) changes.rating = rating;
    if (year !== yearOf(original)) changes.released = year == null ? null : String(year);
    if (!sameList(developers, listOf(original.developers))) changes.developers = developers;
    if (!sameList(publishers, listOf(original.publishers))) changes.publishers = publishers;

    const button = form.querySelector("button[type=submit]");
    setBusy(button, true, "Saving");
    try {
      const game = await api("/api/games/" + encodeURIComponent(id), { method: "PUT", body: changes });
      setFlash("Saved changes to “" + (game.title || "Untitled game") + "”.");
      window.location.href = "index.html#collection";
    } catch (err) {
      setBusy(button, false);
      showFormError(form, err.message);
    }
  });

  loadGame();
}
