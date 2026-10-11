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

// Monotonic ID generation: timestamp advanced past highest existing ID to avoid collisions
exports.newId = (list) =>
  list.reduce((next, item) => Math.max(next, Number(item.id) + 1 || 0), Date.now());
