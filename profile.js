const express = require("express");
const db = require("./db");
const auth = require("./auth");
const friends = require("./friends");

// The page sends a 256 pixel JPEG. These limits are for anything else that calls the route.
const PICTURE_MAX_BYTES = 512 * 1024;
const PICTURE_MAX_SIDE = 1024;
const SHELF_MAX = 200;
// What a game or wishlist entry shows to a friend. The owner's account id stays out of it.
const SHELF_FIELDS = ["id", "rawg_id", "title", "released", "rating", "image", "platforms", "genres",
  "developers", "publishers", "website", "esrb", "metacritic", "playtime"];

// Width and height from a JPEG's frame header, or null if the bytes are not a JPEG with one. A picture
// claiming to be huge can fit in a small file and use gigabytes in every browser that draws it.
function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at++; continue; }
    // Markers with no length: TEM, the restart markers and a repeated start of image
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // the image ended, or the scan began, with no frame header
    const length = bytes.readUInt16BE(at + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8 || at + 9 > bytes.length) return null;
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

function shelf(list, userId) {
  const owned = list.filter((item) => item.userId === userId).sort((a, b) => b.id - a.id);
  const items = owned.slice(0, SHELF_MAX).map((item) =>
    Object.fromEntries(SHELF_FIELDS.filter((field) => item[field] !== undefined).map((field) => [field, item[field]])));
  return { total: owned.length, items };
}

const findPerson = (username, more = () => true) =>
  db.users.read().find((u) => u.key === String(username).toLowerCase() && !u.isGuest && more(u));

const router = express.Router();
const requireMember = auth.requireMember("change your profile picture");

// Anyone can see a picture, because comments show it. People are found by username, so no account id is exposed.
router.get("/:username/avatar", (req, res) => {
  const user = findPerson(req.params.username, (u) => u.avatarAt);
  const bytes = user && db.avatars.read(user.id);
  if (!bytes) return res.status(404).json({ error: "No picture" });
  // The page puts the version (avatarAt) in the address, so a versioned picture never changes
  res.set({
    "Content-Type": "image/jpeg",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    "Cache-Control": req.query.v ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.send(bytes);
});

// Any member can see who a player is and how they stand with them. The collection and wishlist
// only go to friends, and to the owner.
router.get("/:username", auth.requireMember("view profiles"), (req, res) => {
  const person = findPerson(req.params.username);
  if (!person) return res.status(404).json({ error: "No one has that username." });
  const links = db.friends.read();
  const relation = person.id === req.user.id ? "self" : friends.relation(links, req.user.id, person.id);
  const open = relation === "self" || relation === "friends";
  res.json({
    username: person.username,
    avatarAt: person.avatarAt ?? null,
    createdAt: person.createdAt,
    relation,
    friendCount: friends.friendCount(links, person.id),
    collection: open ? shelf(db.games.read(), person.id) : null,
    wishlist: open ? shelf(db.wishlist.read(), person.id) : null,
  });
});

// Saves (with a JPEG body) or removes the signed-in player's picture
function changePicture(req, res, bytes) {
  const users = db.users.read();
  const user = users.find((u) => u.id === req.user.id);
  if (bytes) {
    db.avatars.write(user.id, bytes);
    user.avatarAt = new Date().toISOString();
  } else {
    db.avatars.remove(user.id);
    delete user.avatarAt;
  }
  db.users.write(users);
  res.json({ user: auth.publicUser(user) });
}

router.put("/avatar", requireMember, express.raw({ type: "image/jpeg", limit: PICTURE_MAX_BYTES }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(415).json({ error: "Send the picture as a JPEG image." });
  const size = jpegSize(req.body);
  if (!size?.width || !size.height || size.width > PICTURE_MAX_SIDE || size.height > PICTURE_MAX_SIDE) {
    return res.status(400).json({ error: "That isn't a usable JPEG. Pictures can be up to " + PICTURE_MAX_SIDE + " pixels wide and tall." });
  }
  changePicture(req, res, req.body);
});

router.delete("/avatar", requireMember, (req, res) => changePicture(req, res, null));

module.exports = { router };
