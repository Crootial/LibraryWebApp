const fs = require("fs");
const path = require("path");

const DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DIR, { recursive: true });

// One JSON file holds one list. A damaged file throws instead of being overwritten with an empty list.
function table(name) {
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]", "utf8");
  return {
    read() {
      const list = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
      if (!Array.isArray(list)) throw new Error(name + " should hold a list");
      return list;
    },
    write: (list) => fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8"),
  };
}

exports.games = table("library.json");
exports.wishlist = table("wishlist.json");
exports.users = table("users.json");
exports.sessions = table("sessions.json");
exports.comments = table("comments.json");
exports.friends = table("friends.json");

// Profile pictures are files, not JSON: avatars/<userId>.jpg
const AVATAR_DIR = path.join(DIR, "avatars");
function avatarFile(userId) {
  if (!/^[\w-]{1,64}$/.test(String(userId))) throw new Error("Not an account id: " + userId);
  return path.join(AVATAR_DIR, userId + ".jpg");
}

exports.avatars = {
  read(userId) {
    try {
      return fs.readFileSync(avatarFile(userId));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  },
  write(userId, bytes) {
    // Write beside the old picture, then swap, so nobody ever reads half a file
    const file = avatarFile(userId);
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    fs.writeFileSync(file + ".tmp", bytes);
    fs.renameSync(file + ".tmp", file);
  },
  remove: (userId) => fs.rmSync(avatarFile(userId), { force: true }),
};

// The current time in milliseconds, moved past the highest id in the list so ids never repeat
exports.newId = (list) => list.reduce((next, item) => Math.max(next, Number(item.id) + 1 || 0), Date.now());
