const express = require("express");
const db = require("./db");
const auth = require("./auth");

// One record per pair of accounts: { id, from, to, status, createdAt, acceptedAt }.
// "pending" means `from` has asked `to` and is waiting; "accepted" means they are friends.
const MAX_WAITING = 50; // requests one account can have waiting for an answer at once

const router = express.Router();
router.use(auth.requireMember("use friends"));

// People are found by username, the same way their picture is. Guests have no profile.
const findPerson = (username) =>
  db.users.read().find((u) => u.key === String(username ?? "").toLowerCase() && !u.isGuest) || null;

const between = (links, a, b) => links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));

// How the viewer stands with the other player: "friends", "requested" (the viewer asked),
// "incoming" (the other one asked) or "none"
function relation(links, viewerId, otherId) {
  const link = between(links, viewerId, otherId);
  if (!link) return "none";
  if (link.status === "accepted") return "friends";
  return link.from === viewerId ? "requested" : "incoming";
}

const friendCount = (links, userId) =>
  links.filter((l) => l.status === "accepted" && (l.from === userId || l.to === userId)).length;

// The signed-in player's friends, the requests waiting for their answer, and the ones they sent
router.get("/", (req, res) => {
  const me = req.user.id;
  const people = new Map(db.users.read().map((u) => [u.id, u]));
  const lists = { friends: [], incoming: [], outgoing: [] };
  for (const link of db.friends.read()) {
    if (link.from !== me && link.to !== me) continue;
    const other = people.get(link.from === me ? link.to : link.from);
    if (!other) continue;
    const who = { username: other.username, avatarAt: other.avatarAt ?? null };
    if (link.status === "accepted") lists.friends.push({ ...who, since: link.acceptedAt });
    else lists[link.to === me ? "incoming" : "outgoing"].push({ ...who, sentAt: link.createdAt });
  }
  lists.friends.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));
  for (const list of [lists.incoming, lists.outgoing]) list.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  res.json(lists);
});

// Add someone: asks them, or accepts if they have already asked you. Asking twice changes nothing.
router.post("/:username", (req, res) => {
  const other = findPerson(req.params.username);
  if (!other) return res.status(404).json({ error: "No one has that username." });
  const me = req.user.id;
  if (other.id === me) return res.status(400).json({ error: "You can't add yourself." });

  const links = db.friends.read();
  const link = between(links, me, other.id);
  if (!link) {
    if (links.filter((l) => l.from === me && l.status === "pending").length >= MAX_WAITING) {
      return res.status(429).json({ error: "You have " + MAX_WAITING + " requests waiting. Wait for some answers first." });
    }
    links.push({ id: db.newId(links), from: me, to: other.id, status: "pending", createdAt: new Date().toISOString() });
    db.friends.write(links);
    return res.status(201).json({ relation: "requested" });
  }
  if (link.status === "pending" && link.to === me) {
    Object.assign(link, { status: "accepted", acceptedAt: new Date().toISOString() });
    db.friends.write(links);
  }
  res.json({ relation: link.status === "accepted" ? "friends" : "requested" });
});

// Cancel a request you sent, decline one you got, or unfriend
router.delete("/:username", (req, res) => {
  const other = findPerson(req.params.username);
  if (!other) return res.status(404).json({ error: "No one has that username." });
  const links = db.friends.read();
  const link = between(links, req.user.id, other.id);
  if (!link) return res.status(404).json({ error: "You aren't friends, and there is no request between you." });
  db.friends.write(links.filter((l) => l !== link));
  res.json({ relation: "none" });
});

module.exports = { router, relation, friendCount };
