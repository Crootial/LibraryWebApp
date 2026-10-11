// Profile: a picture to set and update, and the player's collection and wishlist as shelves of covers.
// The Account panel turns into this once someone is signed in.
const PICTURE_SIDE = 256;
const PICTURE_MIN_SIDE = 32;
const PICTURE_MAX_FILE = 15 * 1024 * 1024;
const SHELF_SIZE = 12;

// A picture that has been picked and shrunk but not saved yet: { userId, blob, url }
let pictureDraft = null;

function discardPicture() {
  if (pictureDraft) URL.revokeObjectURL(pictureDraft.url);
  pictureDraft = null;
}

// Crop to the middle square, shrink to 256 pixels and encode as a JPEG, which is all the server takes.
// Drawing the picture again also drops whatever the original file carried, such as where a photo was taken.
async function pictureToJpeg(file) {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a picture. Pick a JPG, PNG, WebP or GIF.");
  if (file.size > PICTURE_MAX_FILE) throw new Error("That picture is over 15 MB. Pick a smaller one.");

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("This browser couldn't open that picture. Try a JPG or PNG.");
    }

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (side < PICTURE_MIN_SIDE) {
      throw new Error("That picture is too small. Use one at least " + PICTURE_MIN_SIDE + " pixels wide and tall.");
    }

    const size = Math.min(PICTURE_SIDE, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; // JPEG has no see-through, so a transparent PNG goes onto white
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);

    const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.9));
    if (!blob) throw new Error("This browser couldn't shrink that picture.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The account button in the masthead: the player's picture once they have one, the plain icon before
function renderAccountLink() {
  const { user } = store;
  const hasPicture = Boolean(user && !user.isGuest && user.avatarAt);
  $("account-pic").replaceChildren(hasPicture ? avatar(user.username, user.avatarAt, "sm") : icon("user"));
}

function renderPicture(user) {
  const draft = Boolean(pictureDraft);
  const has = Boolean(user.avatarAt);

  const tile = draft ? avatarTile(user.username, "lg", pictureDraft.url) : avatar(user.username, user.avatarAt, "lg");
  tile.classList.toggle("is-draft", draft);
  $("profile-avatar").replaceChildren(tile);

  const pick = $("avatar-pick");
  pick.textContent = draft ? "Choose another" : has ? "Change picture" : "Upload picture";
  pick.classList.toggle("btn-primary", !draft);
  pick.classList.toggle("btn-ghost", draft);
  $("avatar-save").hidden = !draft;
  $("avatar-cancel").hidden = !draft;
  $("avatar-remove").hidden = draft || !has;
  $("profile-note").textContent = draft
    ? "This is how it will look. Save it to use this picture."
    : has
      ? "This picture shows beside your comments in the forums."
      : "No picture yet. Add one to show beside your comments in the forums.";
}

// A sentence for a shelf that is empty or failed: strings are text, [label, href] pairs are links
function say(box, parts) {
  box.replaceChildren(...parts.map((part) =>
    Array.isArray(part) ? el("a", { class: "text-link", href: part[1], text: part[0] }) : part));
  box.hidden = false;
}

const SHELVES = {
  collection: {
    items: () => store.games,
    state: () => store.loaded.games,
    empty: ["Nothing here yet. ", ["Look up a game", "#lookup"], " or ", ["add one yourself", "#add"], " to start your collection."],
    failed: ["Couldn't load your games. ", ["Open My games", "#collection"], " to try again."],
  },
  wishlist: {
    items: () => store.wishlist,
    state: () => store.loaded.wishlist,
    empty: ["Nothing here yet. Tap the heart on a game, or ", ["see what's trending", "#home"], "."],
    failed: ["Couldn't load your wishlist. ", ["Open Wishlist", "#wishlist"], " to try again."],
  },
};

// Make a node open a game's details, with the keyboard too, like the covers and titles elsewhere
function opensDetails(node, game) {
  const open = (e) => {
    e.stopPropagation();
    openGameDetail(game);
  };
  node.addEventListener("click", open);
  node.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(e);
    }
  });
  return node;
}

function shelfItem(game) {
  const title = game.title || "Untitled game";
  const rating = ratingOf(game);
  const facts = [yearOf(game), rating && rating.toFixed(1) + " / 5"].filter(Boolean).join(" · ");
  const heading = opensDetails(el("p", {
    class: "shelf-title clickable-title",
    text: title,
    role: "button",
    tabindex: "0",
    "aria-label": "View details for " + title,
  }), game);

  return el("li", { class: "shelf-item" },
    cover(game, "lg"),
    el("div", { class: "shelf-body" },
      heading,
      facts ? el("p", { class: "shelf-meta", text: facts }) : null,
    ),
  );
}

function renderShelf(kind) {
  const shelf = SHELVES[kind];
  const items = shelf.items();
  const state = shelf.state();
  const list = $("profile-" + kind);
  const note = $("profile-" + kind + "-note");
  const loaded = state === true;

  note.hidden = true;
  $("profile-" + kind + "-count").hidden = !loaded;
  $("profile-" + kind + "-all").hidden = !loaded || !items.length;

  if (state === "failed") {
    list.replaceChildren();
    list.removeAttribute("aria-busy");
    say(note, shelf.failed);
    return;
  }
  if (!loaded) {
    showSkeletons(list, 4);
    return;
  }

  $("profile-" + kind + "-count").textContent = items.length;
  list.removeAttribute("aria-busy");
  const shown = [...items].sort((a, b) => b.id - a.id).slice(0, SHELF_SIZE);
  list.replaceChildren(...shown.map(shelfItem));
  if (!shown.length) say(note, shelf.empty);
}

function renderProfile() {
  const { user } = store;
  if (!user || user.isGuest) return discardPicture();
  if (pictureDraft && pictureDraft.userId !== user.id) discardPicture();

  renderPicture(user);
  renderShelf("collection");
  renderShelf("wishlist");
}

// The server's answer holds the account with its new picture version (or none, after a removal)
function useNewPicture(user) {
  store.user.avatarAt = user.avatarAt || null;
  discardPicture();
  // Comments already on screen belong to threads kept in memory; give the player's own the new picture
  for (const thread of forumThreads.values()) {
    for (const comment of thread.comments) if (comment.mine) comment.avatarAt = store.user.avatarAt;
  }
  renderAccountLink();
  renderAccount();
}

function pictureFailed(err) {
  if (err.status === 403) askToSignIn(err.message);
  else showFailure(err);
}

async function savePicture() {
  const draft = pictureDraft;
  if (!draft) return;
  const others = ["avatar-pick", "avatar-cancel"].map($);
  const save = $("avatar-save");
  let saved = false;
  others.forEach((button) => { button.disabled = true; });
  setBusy(save, true, "Saving");
  try {
    const { user } = await api("/api/profile/avatar", { method: "PUT", body: draft.blob });
    useNewPicture(user);
    saved = true;
    toast("Profile picture saved.");
  } catch (err) {
    pictureFailed(err);
  } finally {
    setBusy(save, false);
    others.forEach((button) => { button.disabled = false; });
    if (saved) $("avatar-pick").focus(); // the Save button is gone now, so keep the keyboard on this panel
  }
}

async function removePicture() {
  const remove = $("avatar-remove");
  setBusy(remove, true, "Removing");
  try {
    const { user } = await api("/api/profile/avatar", { method: "DELETE" });
    useNewPicture(user);
    toast("Profile picture removed.");
    $("avatar-pick").focus();
  } catch (err) {
    pictureFailed(err);
  } finally {
    setBusy(remove, false);
  }
}

function initProfile() {
  const file = $("avatar-file");
  const pick = $("avatar-pick");

  pick.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const picked = file.files[0];
    file.value = ""; // so choosing the same file again still counts as a change
    if (!picked || !store.user) return;

    pick.disabled = true;
    try {
      const blob = await pictureToJpeg(picked);
      discardPicture();
      pictureDraft = { userId: store.user.id, blob, url: URL.createObjectURL(blob) };
    } catch (err) {
      toast(err.message, "error");
    } finally {
      pick.disabled = false;
      renderProfile();
    }
  });

  $("avatar-cancel").addEventListener("click", () => {
    discardPicture();
    renderProfile();
    pick.focus();
  });
  $("avatar-save").addEventListener("click", savePicture);
  $("avatar-remove").addEventListener("click", removePicture);
}
