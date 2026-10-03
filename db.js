const fs = require("fs");
const path = require("path");

// The JSON files live in the same folder as this file, unless DATA_DIR points somewhere else
// (a mounted volume, or a scratch folder for testing).
const DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DIR, { recursive: true });

// One table is one JSON file that holds a list. A missing file starts out as an empty list.
// A file that can't be read throws, so a damaged file is never mistaken for an empty one
// and then written over.
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

// The saved games. Each one carries the userId of the account that owns it.
const library = table("library.json");
exports.read = library.read;
exports.write = library.write;

// Games a person wants but doesn't own yet, also marked with their userId.
exports.wishlist = table("wishlist.json");

// Accounts, and the sign-ins that are still good. Both stay out of git (see .gitignore).
exports.users = table("users.json");
exports.sessions = table("sessions.json");

// A new id for an entry in a list: the current time, moved past the largest id already
// there, so two entries made in the same millisecond can't end up sharing one.
exports.newId = (list) =>
  list.reduce((next, item) => Math.max(next, Number(item.id) + 1 || 0), Date.now());
