const fs = require("fs");
const path = require("path");

// Resolves exact absolute path to library.json in the same folder
const FILE = path.join(__dirname, "library.json");

// Ensure the file exists with an empty array if missing
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, "[]", "utf8");
}

exports.read = () => {
  try {
    const data = fs.readFileSync(FILE, "utf8");
    return JSON.parse(data || "[]");
  } catch (error) {
    console.error("Error reading library.json:", error);
    return [];
  }
};

exports.write = (data) => {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing to library.json:", error);
  }
};