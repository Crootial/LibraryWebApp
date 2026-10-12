// Friends: the people you have added, the requests waiting for an answer, and the buttons that change
// them. Another player's page, where you add them, is in person.js.

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

// [method, busy label, message once done]
const FRIEND_ACTIONS = {
  add: ["POST", "Adding", (name, answer) => (answer.relation === "friends" ? "You and " + name + " are friends now." : "Friend request sent to " + name + ".")],
  accept: ["POST", "Accepting", (name) => "You and " + name + " are friends now."],
  decline: ["DELETE", "Declining", (name) => "Declined the request from " + name + "."],
  cancel: ["DELETE", "Cancelling", (name) => "Cancelled your request to " + name + "."],
  unfriend: ["DELETE", "Removing", (name) => "Removed " + name + " from your friends."],
};

// One request to the server, then show things as they are now. A 404 means the request or friendship
// is already gone (the other player got there first), so we redraw instead of just failing.
async function changeFriend(action, username, button) {
  const [method, busyLabel, done] = FRIEND_ACTIONS[action];
  setBusy(button, true, busyLabel);
  try {
    toast(done(username, await api("/api/friends/" + encodeURIComponent(username), { method })));
  } catch (err) {
    setBusy(button, false);
    if (err.status === 403) return signInThenReturn(err.message);
    showFailure(err);
    if (err.status !== 404) return;
  }
  await loadFriends();
  if (location.hash.startsWith("#user")) showPerson();
}

const friendButton = (label, style, description, action, username) => el("button", {
  class: "btn btn-sm btn-" + style, type: "button", text: label, "aria-label": description,
  onclick: (e) => changeFriend(action, username, e.currentTarget),
});

// Two clicks to remove a friend, like deleting a game
const unfriendButton = (username) => confirmButton(
  { class: "btn btn-danger btn-sm", text: "Remove friend", "aria-label": "Remove " + username + " from your friends" },
  (button) => changeFriend("unfriend", username, button),
);

// A player in a list: their picture and name open their page, with any buttons beside them
const personRow = (entry, ...actions) => el("li", { class: "person" },
  el("a", { class: "person-link", href: "#user:" + encodeURIComponent(entry.username), "aria-label": "View " + entry.username + "'s profile" },
    avatar(entry.username, entry.avatarAt, "md"),
    el("span", { class: "person-name", text: entry.username }),
  ),
  actions.length ? el("div", { class: "person-actions" }, ...actions) : null,
);

// The friend sections of your own profile
function renderFriends() {
  renderAccountBadge();
  if (!isMember()) return;
  const { friends, incoming, outgoing } = store.friends;
  const state = store.loaded.friends;
  $("member-friends").textContent = state === true ? friends.length : "-";

  $("profile-requests-section").hidden = !incoming.length;
  $("profile-requests-count").textContent = incoming.length;
  $("profile-requests").replaceChildren(...incoming.map((p) => personRow(p,
    friendButton("Accept", "primary", "Accept the friend request from " + p.username, "accept", p.username),
    friendButton("Decline", "ghost", "Decline the friend request from " + p.username, "decline", p.username),
  )));

  $("profile-friends-count").hidden = state !== true;
  $("profile-friends-count").textContent = friends.length;
  $("profile-friends").replaceChildren(...friends.map((p) => personRow(p)));
  const note = $("profile-friends-note");
  note.hidden = state === true && friends.length > 0;
  if (state === "failed") {
    note.replaceChildren("Couldn't load your friends. ", el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Try again", onclick: loadFriends }));
  } else if (state !== true) {
    note.textContent = "Loading your friends...";
  } else if (!friends.length) {
    note.textContent = "No friends yet. Open a name in a game's forum to see their profile and add them.";
  }

  $("profile-sent-section").hidden = !outgoing.length;
  $("profile-sent").replaceChildren(...outgoing.map((p) => personRow(p,
    friendButton("Cancel", "ghost", "Cancel your friend request to " + p.username, "cancel", p.username),
  )));
}

// Opening your profile picks up any requests that came in since the page loaded
window.addEventListener("tab-shown", (e) => {
  if (e.detail?.name === "account") loadFriends();
});
