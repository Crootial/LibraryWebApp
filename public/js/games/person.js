// Another player's profile, opened from their name in the forums: #user:<username>.
// Any signed-in player sees who they are and can add them as a friend. Their collection and
// wishlist open up once you are friends.

let personOrigin = "#home"; // where Back goes: the page the player was on when they opened this one
let viaPerson = false; // true while looking at games that were opened from a player's page
let personRequest = 0; // counts loads, so a slow answer for a page we have left is ignored
const personShowing = { name: "", collection: SHELF_SIZE, wishlist: SHELF_SIZE }; // how many of each shelf show

// Remember where a player's page was opened from. Going to a game from it and coming back through the
// game's Back button must not make the game the new "where from".
window.addEventListener("hashchange", (e) => {
  const from = new URL(e.oldURL).hash;
  const to = location.hash;
  if (to.startsWith("#user")) {
    if (!viaPerson && from && !from.startsWith("#user")) personOrigin = from;
  } else {
    viaPerson = to.startsWith("#game") && (from.startsWith("#user") || (viaPerson && from.startsWith("#game")));
  }
});

const leavePerson = () => { location.hash = personOrigin || "#home"; };

// What shows instead of the collection and wishlist until you are friends
function lockedText({ username: name, relation }) {
  if (relation === "incoming") return name + " wants to be your friend. Accept to see their collection and wishlist.";
  if (relation === "requested") return "Your request is waiting for " + name + ". You'll see their collection and wishlist once they accept.";
  return "Add " + name + " as a friend to see their collection and wishlist.";
}

// The buttons beside the name, which depend on how you and this player stand
function personButtons({ username: name, relation }) {
  if (relation === "friends") return [el("span", { class: "chip chip-badge chip-owned", text: "Friends" }), unfriendButton(name)];
  if (relation === "requested") {
    return [el("span", { class: "chip chip-badge", text: "Request sent" }), friendButton("Cancel request", "ghost", "Cancel your friend request to " + name, "cancel", name)];
  }
  if (relation === "incoming") {
    return [
      friendButton("Accept request", "primary", "Accept the friend request from " + name, "accept", name),
      friendButton("Decline", "ghost", "Decline the friend request from " + name, "decline", name),
    ];
  }
  return [friendButton("Add friend", "primary", "Add " + name + " as a friend", "add", name)];
}

// One shelf of their games: the newest few, and a button for more
function personShelf(kind, title, data, owner) {
  const list = el("ul", { class: "shelf" });
  const more = el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => {
    personShowing[kind] += SHELF_SIZE;
    draw();
  } });
  const draw = () => {
    const shown = data.items.slice(0, personShowing[kind]);
    list.replaceChildren(...shown.map(shelfItem));
    more.hidden = data.items.length <= shown.length;
    more.textContent = "Show more (" + (data.items.length - shown.length) + " left)";
  };
  draw();
  return el("section", { class: "shelf-section", "aria-label": title },
    el("div", { class: "shelf-head" }, el("h3", {}, title, el("span", { class: "chip shelf-count", text: String(data.total) }))),
    data.items.length ? list : el("p", { class: "shelf-note", text: owner + " hasn't added anything here yet." }),
    data.items.length ? el("div", { class: "shelf-more" }, more) : null,
  );
}

function drawPerson(profile) {
  const name = profile.username;
  if (personShowing.name !== name) Object.assign(personShowing, { name, collection: SHELF_SIZE, wishlist: SHELF_SIZE });
  const friends = profile.friendCount + (profile.friendCount === 1 ? " friend" : " friends");
  $("user-view").replaceChildren(
    el("div", { class: "profile-head" },
      el("div", { class: "profile-avatar" }, avatar(name, profile.avatarAt, "lg")),
      el("div", { class: "profile-id" },
        el("p", { class: "hint", text: "Player" }),
        el("h3", { class: "member-name", text: name }),
        el("p", { class: "profile-note", text: "Member since " + (formatDate(profile.createdAt) || "-") + " · " + friends }),
        el("div", { class: "profile-actions" }, ...personButtons(profile)),
      ),
    ),
    ...(profile.collection && profile.wishlist
      ? [personShelf("collection", "Collection", profile.collection, name), personShelf("wishlist", "Wishlist", profile.wishlist, name)]
      : [el("p", { class: "shelf-note", text: lockedText(profile) })]),
  );
}

async function showPerson() {
  const mine = ++personRequest;
  const name = usernameIn(location.hash);
  const status = $("user-status");
  const empty = $("user-empty");
  $("user-view").replaceChildren();
  empty.hidden = true;
  status.textContent = "";

  // No name goes home, and your own name goes to your own profile
  if (!name || (isMember() && store.user.username.toLowerCase() === name.toLowerCase())) {
    location.hash = name ? "account" : "home";
    return;
  }
  if (!isMember()) {
    store.returnTo = location.hash; // once they sign in they come back to this page
    return fillEmpty(empty, { title: "Sign in to view profiles", text: "See who is behind the comments, and add them as a friend.", links: SIGN_IN_LINKS });
  }

  status.textContent = "Loading profile...";
  try {
    const profile = await api("/api/profile/" + encodeURIComponent(name));
    if (mine !== personRequest) return;
    status.textContent = "";
    drawPerson(profile);
  } catch (err) {
    if (mine !== personRequest) return;
    status.textContent = "";
    if (err.status === 403) return signInThenReturn(err.message);
    fillEmpty(empty, err.status === 404
      ? { title: "No one has that username", text: "Check the spelling, or open a name from a game's forum.", links: [{ text: "Go home", href: "#home", primary: true }] }
      : { title: "Couldn't load this profile", text: err.message, retry: showPerson });
  }
}

function initPerson() {
  $("user-back").addEventListener("click", leavePerson);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && location.hash.startsWith("#user")) leavePerson();
  });
  window.addEventListener("tab-shown", (e) => {
    if (e.detail?.name === "user") showPerson();
  });
}
