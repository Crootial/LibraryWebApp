const express = require("express");
const db = require("./db");
const auth = require("./auth");
const friends = require("./friends");

// The page shrinks a picture to a 256 pixel JPEG before sending it. These limits are for anything
// else that calls the route, and for the browsers that will draw the picture beside a comment.
const PICTURE_MAX_BYTES = 512 * 1024;
const PICTURE_MAX_SIDE = 1024;

// Width and height from the first start-of-frame segment of a JPEG, or null if the bytes are not a
// JPEG with one. A picture claiming to be tens of thousands of pixels wide can fit in a small file
// and then use gigabytes of memory in every browser that draws it, so the size is checked here.
function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at++; continue; }
    // Markers with no length: TEM, the restart markers and a repeated start of image
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    // End of image, or the scan itself, before any frame header
    if (marker === 0xd9 || marker === 0xda) return null;

    const length = bytes.readUInt16BE(at + 2);
    if (length < 2) return null;
    const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) {
      if (length < 8 || at + 9 > bytes.length) return null;
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

const readPicture = express.raw({ type: "image/jpeg", limit: PICTURE_MAX_BYTES });

// Answers in JSON when the picture is too big or cannot be read, like every other route
function pictureBody(req, res, next) {
  readPicture(req, res, (error) => {
    if (!error) return next();
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: "That picture is too big. The limit is " + PICTURE_MAX_BYTES / 1024 + " KB." });
    }
    console.error("Picture Upload Error:", error);
    res.status(400).json({ error: "Couldn't read that picture." });
  });
}

// What a game or wishlist entry shows to a friend. The owner's account id stays out of it.
const SHELF_FIELDS = [
  "id", "rawg_id", "title", "released", "rating", "image", "platforms", "genres",
  "developers", "publishers", "website", "esrb", "metacritic", "playtime",
];
const SHELF_MAX = 200;

function shelf(list, userId) {
  const owned = list.filter((item) => item.userId === userId).sort((a, b) => b.id - a.id);
  const items = owned.slice(0, SHELF_MAX).map((item) =>
    Object.fromEntries(SHELF_FIELDS.filter((field) => item[field] !== undefined).map((field) => [field, item[field]])));
  return { total: owned.length, items };
}

const router = express.Router();
const requireMember = auth.requireMember("change your profile picture");
const requireViewer = auth.requireMember("view profiles");

// Anyone can see a picture, because comments show it. People are found by username, so no account id is exposed.
router.get("/:username/avatar", (req, res) => {
  try {
    const key = String(req.params.username).toLowerCase();
    const user = db.users.read().find((u) => u.key === key && !u.isGuest && u.avatarAt);
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
  } catch (error) {
    console.error("Picture Read Error:", error);
    res.status(500).json({ error: "Failed to load the picture" });
  }
});

// Another player's profile. Any member can see who they are and how they stand with them, but the
// collection and wishlist only go to friends, and to the owner.
router.get("/:username", requireViewer, (req, res) => {
  try {
    const key = String(req.params.username).toLowerCase();
    const person = db.users.read().find((u) => u.key === key && !u.isGuest);
    if (!person) return res.status(404).json({ error: "No one has that username." });

    const links = db.friends.read();
    const relation = person.id === req.user.id ? "self" : friends.relation(links, req.user.id, person.id);
    const profile = {
      username: person.username,
      avatarAt: person.avatarAt ?? null,
      createdAt: person.createdAt,
      relation,
      friendCount: friends.friendCount(links, person.id),
      collection: null,
      wishlist: null,
    };
    if (relation === "self" || relation === "friends") {
      profile.collection = shelf(db.read(), person.id);
      profile.wishlist = shelf(db.wishlist.read(), person.id);
    }
    res.json(profile);
  } catch (error) {
    console.error("Profile Read Error:", error);
    res.status(500).json({ error: "Failed to load the profile" });
  }
});

router.put("/avatar", requireMember, pictureBody, (req, res) => {
  try {
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || !bytes.length) {
      return res.status(415).json({ error: "Send the picture as a JPEG image." });
    }
    const size = jpegSize(bytes);
    if (!size || !size.width || !size.height || size.width > PICTURE_MAX_SIDE || size.height > PICTURE_MAX_SIDE) {
      return res.status(400).json({
        error: "That isn't a usable JPEG. Pictures can be up to " + PICTURE_MAX_SIDE + " pixels wide and tall.",
      });
    }

    const users = db.users.read();
    const user = users.find((u) => u.id === req.user.id);
    if (!user) return res.status(403).json({ error: "Sign in or create an account to change your profile picture." });

    db.avatars.write(user.id, bytes);
    user.avatarAt = new Date().toISOString();
    db.users.write(users);
    res.json({ user: auth.publicUser(user) });
  } catch (error) {
    console.error("Picture Save Error:", error);
    res.status(500).json({ error: "Failed to save your picture" });
  }
});

router.delete("/avatar", requireMember, (req, res) => {
  try {
    const users = db.users.read();
    const user = users.find((u) => u.id === req.user.id);
    if (!user) return res.status(403).json({ error: "Sign in or create an account to change your profile picture." });

    db.avatars.remove(user.id);
    delete user.avatarAt;
    db.users.write(users);
    res.json({ user: auth.publicUser(user) });
  } catch (error) {
    console.error("Picture Delete Error:", error);
    res.status(500).json({ error: "Failed to remove your picture" });
  }
});

module.exports = { router };
