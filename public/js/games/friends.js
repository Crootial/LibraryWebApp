// Friends: the people you have added, the requests waiting for an answer, and the buttons that change
// them. Another player's page, where you add them, is in person.js.

const isMember = () => Boolean(store.user && !store.user.isGuest);

async function loadFriends() {
  if (!isMember()) return;
  try {
    store.friends = await api("/api/friends");
    store.loaded.friends = true;
  } catch (err) {
    if (err.status === 401) return;
    if (store.loaded.friends !== true) store.loaded.friends = "failed"; // after a good load, keep what we have
  }
  renderFriends();
}

// The account button in the masthead shows how many friend requests are waiting for you
function renderAccountBadge() {
  const waiting = isMember() ? store.friends.incoming.length : 0;
  const badge = $("account-badge");
  badge.hidden = !waiting;
  badge.textContent = waiting;

  const who = store.user ? "Your account: " + store.user.username : "Sign in or create an account";
  const note = waiting ? ", " + waiting + " friend request" + (waiting === 1 ? "" : "s") + " waiting" : "";
  $("account-link").setAttribute("aria-label", who + note);
}

// One request to the server, then show things as they are now. The 404 case means the friendship or
// request is already gone (the other player got there first), so we redraw instead of just failing.
async function changeFriend(method, username, button, busyLabel, done) {
  setBusy(button, true, busyLabel);
  try {
    const answer = await api("/api/friends/" + encodeURIComponent(username), { method });
    toast(done(answer));
  } catch (err) {
    setBusy(button, false);
    if (err.status === 403) return signInThenReturn(err.message);
    showFailure(err);
    if (err.status !== 404) return;
  }
  await loadFriends();
  if (location.hash.startsWith("#user")) showPerson();
}

const addFriend = (username, button) => changeFriend("POST", username, button, "Adding", (answer) =>
  answer.relation === "friends" ? "You and " + username + " are friends now." : "Friend request sent to " + username + ".");
const acceptFriend = (username, button) => changeFriend("POST", username, button, "Accepting", () =>
  "You and " + username + " are friends now.");
const declineFriend = (username, button) => changeFriend("DELETE", username, button, "Declining", () =>
  "Declined the request from " + username + ".");
const cancelFriend = (username, button) => changeFriend("DELETE", username, button, "Cancelling", () =>
  "Cancelled your request to " + username + ".");
const unfriend = (username, button) => changeFriend("DELETE", username, button, "Removing", () =>
  "Removed " + username + " from your friends.");

function friendButton(label, kind, description, action) {
  const button = el("button", {
    class: "btn btn-sm " + (kind === "primary" ? "btn-primary" : "btn-ghost"),
    type: "button",
    text: label,
    "aria-label": description,
  });
  button.addEventListener("click", () => action(button));
  return button;
}

// Two clicks to remove a friend, like deleting a game: the first arms the button for a few seconds
function unfriendButton(username) {
  const button = el("button", {
    class: "btn btn-danger btn-sm",
    type: "button",
    text: "Remove friend",
    "aria-label": "Remove " + username + " from your friends",
  });
  let disarm;
  button.addEventListener("click", () => {
    if (button.dataset.armed === "true") {
      clearTimeout(disarm);
      unfriend(username, button);
      return;
    }
    button.dataset.armed = "true";
    button.textContent = "Sure?";
    disarm = setTimeout(() => {
      button.dataset.armed = "false";
      button.textContent = "Remove friend";
    }, 4000);
  });
  return button;
}

// A player in a list: their picture and name open their page, with any buttons beside them
function personRow(entry, ...actions) {
  return el("li", { class: "person" },
    el("a", {
      class: "person-link",
      href: "#user:" + encodeURIComponent(entry.username),
      "aria-label": "View " + entry.username + "'s profile",
    },
      avatar(entry.username, entry.avatarAt, "md"),
      el("span", { class: "person-name", text: entry.username }),
    ),
    actions.length ? el("div", { class: "person-actions" }, ...actions) : null,
  );
}

// The friend sections of your own profile
function renderFriends() {
  renderAccountBadge();
  if (!isMember()) return;

  const { friends, incoming, outgoing } = store.friends;
  const state = store.loaded.friends;
  const loaded = state === true;
  $("member-friends").textContent = loaded ? friends.length : "-";

  $("profile-requests-section").hidden = !incoming.length;
  $("profile-requests-count").textContent = incoming.length;
  $("profile-requests").replaceChildren(...incoming.map((p) => personRow(p,
    friendButton("Accept", "primary", "Accept the friend request from " + p.username, (b) => acceptFriend(p.username, b)),
    friendButton("Decline", "ghost", "Decline the friend request from " + p.username, (b) => declineFriend(p.username, b)),
  )));

  const list = $("profile-friends");
  const note = $("profile-friends-note");
  $("profile-friends-count").hidden = !loaded;
  $("profile-friends-count").textContent = friends.length;
  list.replaceChildren(...friends.map((p) => personRow(p)));
  note.hidden = false;
  if (state === "failed") {
    const retry = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Try again" });
    retry.addEventListener("click", loadFriends);
    note.replaceChildren("Couldn't load your friends. ", retry);
  } else if (!loaded) {
    note.textContent = "Loading your friends...";
  } else if (!friends.length) {
    note.textContent = "No friends yet. Open a name in a game's forum to see their profile and add them.";
  } else {
    note.hidden = true;
  }

  $("profile-sent-section").hidden = !outgoing.length;
  $("profile-sent").replaceChildren(...outgoing.map((p) => personRow(p,
    friendButton("Cancel", "ghost", "Cancel your friend request to " + p.username, (b) => cancelFriend(p.username, b)),
  )));
}

// Opening your profile picks up any requests that came in since the page loaded
window.addEventListener("tab-shown", (e) => {
  if (e.detail?.name === "account") loadFriends();
});
