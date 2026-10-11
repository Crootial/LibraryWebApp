const fs = require("fs");
const path = require("path");


const DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DIR, { recursive: true });

function table(name) {
  const file = path.join(DIR, name);

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]", "utf8");
  }

  return {
    read() {
      try {
        const list = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
        if (!Array.isArray(list)) throw new Error("expected a list");
        return list;
      } catch (error) {
        console.error("Error reading " + name + ":", error);
        throw error;
      }
    },
    write(list) {
      try {
        fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
      } catch (error) {
        console.error("Error writing to " + name + ":", error);
        throw error;
      }
    },
  };
}

const library = table("library.json");
exports.read = library.read;
exports.write = library.write;

exports.wishlist = table("wishlist.json");
exports.users = table("users.json");
exports.sessions = table("sessions.json");
exports.comments = table("comments.json");
exports.friends = table("friends.json");

// Profile pictures are files, not JSON: one JPEG per account, named after the account's id.
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
    const file = avatarFile(userId);
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    // Write beside the old picture, then swap, so nobody ever reads half a file
    fs.writeFileSync(file + ".tmp", bytes);
    fs.renameSync(file + ".tmp", file);
  },
  remove(userId) {
    fs.rmSync(avatarFile(userId), { force: true });
  },
};

// Monotonic ID generation: timestamp advanced past highest existing ID to avoid collisions
exports.newId = (list) =>
  list.reduce((next, item) => Math.max(next, Number(item.id) + 1 || 0), Date.now());
