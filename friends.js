const express = require("express");
const db = require("./db");
const auth = require("./auth");

// A friendship is one record per pair of accounts: { id, from, to, status, createdAt, acceptedAt }.
// "pending" means `from` has asked `to` and is waiting; "accepted" means they are friends.

// How many requests one account can have waiting for an answer at once
const MAX_WAITING = 50;

const router = express.Router();
const requireMember = auth.requireMember("use friends");

// People are found by username, the same way their picture is. Guests have no profile.
function findPerson(username) {
  const key = String(username ?? "").toLowerCase();
  return db.users.read().find((u) => u.key === key && !u.isGuest) || null;
}

const between = (links, a, b) =>
  links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));

// How `viewerId` stands with `otherId`: "friends", "requested" (the viewer asked and is waiting),
// "incoming" (the other one asked), or "none"
function relation(links, viewerId, otherId) {
  const link = between(links, viewerId, otherId);
  if (!link) return "none";
  if (link.status === "accepted") return "friends";
  return link.from === viewerId ? "requested" : "incoming";
}

const friendCount = (links, userId) =>
  links.filter((l) => l.status === "accepted" && (l.from === userId || l.to === userId)).length;

const byName = (a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
const newestFirst = (a, b) => b.sentAt.localeCompare(a.sentAt);

// The signed-in player's friends, the requests waiting for their answer, and the ones they sent
router.get("/", requireMember, (req, res) => {
  try {
    const me = req.user.id;
    const people = new Map(db.users.read().map((u) => [u.id, u]));
    const lists = { friends: [], incoming: [], outgoing: [] };

    for (const link of db.friends.read()) {
      if (link.from !== me && link.to !== me) continue;
      const other = people.get(link.from === me ? link.to : link.from);
      if (!other) continue;
      const who = { username: other.username, avatarAt: other.avatarAt ?? null };
      if (link.status === "accepted") lists.friends.push({ ...who, since: link.acceptedAt });
      else if (link.to === me) lists.incoming.push({ ...who, sentAt: link.createdAt });
      else lists.outgoing.push({ ...who, sentAt: link.createdAt });
    }

    lists.friends.sort(byName);
    lists.incoming.sort(newestFirst);
    lists.outgoing.sort(newestFirst);
    res.json(lists);
  } catch (error) {
    console.error("Friends Read Error:", error);
    res.status(500).json({ error: "Failed to load your friends" });
  }
});

// Add someone: asks them, or, if they have already asked you, accepts. Asking twice changes nothing.
router.post("/:username", requireMember, (req, res) => {
  try {
    const other = findPerson(req.params.username);
    if (!other) return res.status(404).json({ error: "No one has that username." });
    const me = req.user;
    if (other.id === me.id) return res.status(400).json({ error: "You can't add yourself." });

    const links = db.friends.read();
    const link = between(links, me.id, other.id);

    if (!link) {
      const waiting = links.filter((l) => l.from === me.id && l.status === "pending").length;
      if (waiting >= MAX_WAITING) {
        return res.status(429).json({ error: "You have " + MAX_WAITING + " requests waiting. Wait for some answers first." });
      }
      links.push({ id: db.newId(links), from: me.id, to: other.id, status: "pending", createdAt: new Date().toISOString() });
      db.friends.write(links);
      return res.status(201).json({ relation: "requested" });
    }

    if (link.status === "pending" && link.to === me.id) {
      link.status = "accepted";
      link.acceptedAt = new Date().toISOString();
      db.friends.write(links);
      return res.json({ relation: "friends" });
    }

    res.json({ relation: link.status === "accepted" ? "friends" : "requested" });
  } catch (error) {
    console.error("Friend Add Error:", error);
    res.status(500).json({ error: "Failed to add that friend" });
  }
});

// Take back whatever is between the two of you: cancel a request you sent, decline one you got, or unfriend
router.delete("/:username", requireMember, (req, res) => {
  try {
    const other = findPerson(req.params.username);
    if (!other) return res.status(404).json({ error: "No one has that username." });
    const me = req.user.id;

    const links = db.friends.read();
    const rest = links.filter((l) => !((l.from === me && l.to === other.id) || (l.from === other.id && l.to === me)));
    if (rest.length === links.length) {
      return res.status(404).json({ error: "You aren't friends, and there is no request between you." });
    }

    db.friends.write(rest);
    res.json({ relation: "none" });
  } catch (error) {
    console.error("Friend Remove Error:", error);
    res.status(500).json({ error: "Failed to update your friends" });
  }
});

module.exports = { router, relation, friendCount };
