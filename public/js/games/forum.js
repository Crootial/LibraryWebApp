// Game forum: a comment thread at the bottom of a game's details, where signed-in players can post,
// like and dislike. Anyone can read. Every comment is drawn with textContent, never as HTML.
const FORUM_MAX_LENGTH = 1000;
const FORUM_PAGE_SIZE = 10;
const FORUM_FRESH_MS = 15000;

// One thread per game, kept while the page is open so redrawing the details keeps the comments,
// the draft being typed and how many are showing.
const forumThreads = new Map();
let forumSort = "new";

function forumThread(key) {
  if (!forumThreads.has(key)) {
    forumThreads.set(key, { comments: [], loaded: false, failed: false, at: 0, inflight: null, draft: "", shown: FORUM_PAGE_SIZE, voting: new Set(), views: new Set() });
  }
  return forumThreads.get(key);
}

// The RAWG id when the game has one, otherwise its title, so a hand-added game still gets a thread
function forumKeyFor(game, title) {
  const id = Number(game.rawg_id);
  if (Number.isInteger(id) && id > 0) return "rawg-" + id;
  const name = String(title || game.title || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
  return name ? "title-" + name : null;
}

// Redraws every card showing this thread (a game's details page may have been redrawn since)
function forumNotify(thread) {
  for (const view of [...thread.views]) {
    if (view.root.isConnected) view.render();
    else thread.views.delete(view);
  }
}

function forumLoad(key, thread) {
  if (thread.inflight) return thread.inflight;
  thread.failed = false;
  thread.inflight = api("/api/forum/" + encodeURIComponent(key) + "/comments")
    .then((comments) => Object.assign(thread, { comments, loaded: true, at: Date.now() }))
    .catch(() => { thread.failed = !thread.loaded; })
    .finally(() => {
      thread.inflight = null;
      forumNotify(thread);
    });
  return thread.inflight;
}

function forumAgo(iso) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (seconds < 45) return "just now";
  if (minutes < 60) return minutes + "m ago";
  if (hours < 24) return hours + "h ago";
  if (days < 30) return days + "d ago";
  return new Date(then).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Newest first, or Top: the most likes after dislikes are taken away
const forumSorted = (comments) => [...comments].sort(forumSort === "top"
  ? (a, b) => (b.likes - b.dislikes) - (a.likes - a.dislikes) || b.likes - a.likes || b.id - a.id
  : (a, b) => b.id - a.id);

// Shows the new vote straight away, then keeps the server's answer. If the server refuses, puts it back.
async function forumVote(thread, comment, want) {
  if (thread.voting.has(comment.id)) return;
  const next = comment.myVote === want ? 0 : want;
  const before = { likes: comment.likes, dislikes: comment.dislikes, myVote: comment.myVote };
  const count = (vote, by) => {
    if (vote === 1) comment.likes += by;
    if (vote === -1) comment.dislikes += by;
  };
  count(comment.myVote, -1);
  count(next, 1);
  comment.myVote = next;
  thread.voting.add(comment.id);
  forumNotify(thread);
  try {
    Object.assign(comment, await api("/api/forum/comments/" + encodeURIComponent(comment.id) + "/vote", { method: "POST", body: { value: next } }));
  } catch (err) {
    Object.assign(comment, before);
    if (err.status === 403) signInThenReturn(err.message);
    else if (err.status !== 404) showFailure(err);
    else {
      thread.comments = thread.comments.filter((c) => c !== comment);
      toast(err.message, "error");
    }
  } finally {
    thread.voting.delete(comment.id);
    forumNotify(thread);
  }
}

async function forumRemove(thread, comment, button) {
  button.disabled = true;
  button.textContent = "Deleting";
  try {
    await api("/api/forum/comments/" + encodeURIComponent(comment.id), { method: "DELETE" });
    thread.comments = thread.comments.filter((c) => c !== comment);
    toast("Comment deleted.");
  } catch (err) {
    button.disabled = false;
    button.dataset.armed = "false";
    button.textContent = "Delete";
    if (err.status === 403) return signInThenReturn(err.message);
    if (err.status === 404) thread.comments = thread.comments.filter((c) => c !== comment);
    else showFailure(err);
  }
  forumNotify(thread);
}

function forumVoteButton(thread, comment, want, signedIn) {
  const up = want === 1;
  const on = comment.myVote === want;
  const count = up ? comment.likes : comment.dislikes;
  return el("button", {
    class: "vote-btn " + (up ? "vote-up" : "vote-down") + (on ? " is-on" : "") + (thread.voting.has(comment.id) ? " is-pending" : ""),
    type: "button",
    "aria-pressed": String(on),
    "aria-label": (on ? "Undo your " + (up ? "like" : "dislike") : (up ? "Like" : "Dislike") + " this comment") + ". " + count + " so far.",
    "data-focus": (up ? "up-" : "down-") + comment.id,
    onclick: () => (signedIn ? forumVote(thread, comment, want) : signInThenReturn("Sign in to like or dislike comments.")),
  }, icon(up ? "thumbs-up" : "thumbs-down"), el("span", { class: "vote-count", text: String(count) }));
}

function forumCommentItem(thread, comment, signedIn) {
  const name = comment.username || "Player";
  const when = forumAgo(comment.createdAt);
  // Your own name opens your profile; anyone else's opens theirs, where you can add them as a friend
  const profile = comment.mine ? "#account" : "#user:" + encodeURIComponent(name);
  return el("li", { class: "forum-comment" + (comment.mine ? " is-mine" : ""), "data-id": comment.id },
    // The picture links to the same place, but the name is the link a keyboard or screen reader should use
    el("a", { class: "forum-avatar-link", href: profile, tabindex: "-1", "aria-hidden": "true" }, avatar(name, comment.avatarAt, "md")),
    el("div", { class: "forum-main" },
      el("div", { class: "forum-meta" },
        el("a", { class: "forum-author", href: profile, title: comment.mine ? "Your profile" : "View " + name + "'s profile", text: name }),
        comment.mine ? el("span", { class: "forum-you", text: "You" }) : null,
        when ? el("time", { class: "forum-time", datetime: comment.createdAt, title: new Date(comment.createdAt).toLocaleString(), text: when }) : null,
      ),
      el("p", { class: "forum-text", text: comment.body }),
      el("div", { class: "forum-actions" },
        forumVoteButton(thread, comment, 1, signedIn),
        forumVoteButton(thread, comment, -1, signedIn),
        comment.mine ? confirmButton({
          class: "btn btn-danger btn-sm forum-delete", text: "Delete", "aria-label": "Delete your comment", "data-focus": "del-" + comment.id,
        }, (button) => forumRemove(thread, comment, button)) : null,
      ),
    ),
  );
}

// The box to write a comment in, or a Sign in prompt. Returns the element and a function that updates
// its counter and Post button.
function forumComposer(key, thread, name) {
  if (!isMember()) {
    return { composer: el("div", { class: "forum-signin" },
      el("p", { text: "Sign in or create an account to post comments, like and dislike." }),
      el("button", { class: "btn btn-primary btn-sm", type: "button", text: "Sign in", onclick: () => signInThenReturn("Sign in to join the forum.") }),
    ), update: () => {} };
  }

  const input = el("textarea", {
    id: "forum-input",
    class: "forum-input",
    rows: 3,
    maxlength: FORUM_MAX_LENGTH,
    placeholder: "Share a tip, a review or a question about " + name + "...",
    "aria-describedby": "forum-counter",
  });
  input.value = thread.draft;
  const counter = el("span", { id: "forum-counter", class: "forum-counter" });
  const post = el("button", { class: "btn btn-primary", type: "submit" }, el("span", { text: "Post comment" }));
  const composer = el("form", { class: "forum-form", novalidate: true },
    el("label", { for: "forum-input", text: "Add a comment" }),
    input,
    el("div", { class: "forum-form-foot" }, counter, post),
  );
  const update = () => {
    counter.textContent = input.value.length + " / " + FORUM_MAX_LENGTH;
    counter.classList.toggle("is-near", input.value.length >= FORUM_MAX_LENGTH * 0.9);
    post.disabled = !thread.loaded || !input.value.trim();
  };

  input.addEventListener("input", () => {
    thread.draft = input.value;
    update();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    composer.requestSubmit();
  });
  composer.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || post.disabled) return;
    setBusy(post, true, "Posting");
    try {
      thread.comments.unshift(await api("/api/forum/" + encodeURIComponent(key) + "/comments", { method: "POST", body: { body: text } }));
      thread.draft = input.value = "";
      forumSort = "new";
      toast("Comment posted.");
    } catch (err) {
      if (err.status === 403) signInThenReturn(err.message);
      else showFailure(err);
    } finally {
      setBusy(post, false);
      forumNotify(thread);
    }
  });
  return { composer, update };
}

function buildForumCard(game, title) {
  const key = forumKeyFor(game, title);
  if (!key) return null;
  const thread = forumThread(key);
  const signedIn = isMember();
  const name = title || game.title || "this game";
  const { composer, update } = forumComposer(key, thread, name);

  const countEl = el("span", { class: "forum-count" });
  const sortButtons = [["new", "Newest"], ["top", "Top"]].map(([mode, label]) => el("button", {
    class: "btn btn-sm", type: "button", text: label, "data-sort": mode,
    onclick: () => {
      forumSort = mode;
      thread.shown = FORUM_PAGE_SIZE;
      forumNotify(thread);
    },
  }));
  const statusEl = el("div", { class: "forum-status", role: "status" });
  const listEl = el("ul", { class: "forum-list", "aria-label": "Comments on " + name });
  const moreButton = el("button", { class: "btn btn-ghost btn-sm forum-more", type: "button", "data-focus": "more", onclick: () => {
    thread.shown += FORUM_PAGE_SIZE;
    forumNotify(thread);
  } });
  const retry = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "Try again", onclick: () => {
    forumLoad(key, thread);
    render();
  } });

  const root = el("section", { class: "detail-card forum-card", "aria-labelledby": "forum-heading" },
    el("div", { class: "forum-head" },
      el("h3", { id: "forum-heading", class: "detail-card-title" }, el("span", { text: "Forum" }), countEl),
      el("div", { class: "forum-sort", role: "group", "aria-label": "Sort comments" }, ...sortButtons),
    ),
    el("p", { class: "hint forum-hint", text: "Talk about " + name + ". Like the comments worth reading and dislike the rest." }),
    composer,
    statusEl,
    listEl,
    el("div", { class: "forum-more-row" }, moreButton),
  );

  function render() {
    const refocus = root.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
    const total = thread.comments.length;
    countEl.textContent = thread.loaded ? String(total) : "";
    for (const button of sortButtons) button.setAttribute("aria-pressed", String(button.dataset.sort === forumSort));

    statusEl.replaceChildren();
    statusEl.hidden = thread.loaded && total > 0;
    if (!thread.loaded && thread.failed) statusEl.append(el("p", { text: "Couldn't load the comments." }), retry);
    else if (!thread.loaded) statusEl.textContent = "Loading comments...";
    else if (!total) statusEl.textContent = "No comments yet. Be the first to start the discussion.";
    listEl.setAttribute("aria-busy", String(!thread.loaded && !thread.failed));
    listEl.replaceChildren(...forumSorted(thread.comments).slice(0, thread.shown).map((comment) => forumCommentItem(thread, comment, signedIn)));

    moreButton.hidden = total <= thread.shown;
    moreButton.textContent = "Show more comments (" + (total - thread.shown) + " left)";
    update();
    if (refocus) root.querySelector(`[data-focus="${refocus}"]`)?.focus({ preventScroll: true });
  }

  thread.views.add({ root, render });
  render();
  if (!thread.loaded || Date.now() - thread.at > FORUM_FRESH_MS) forumLoad(key, thread);
  return root;
}
