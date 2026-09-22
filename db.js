const fs = require("fs");
const FILE = "library.json";
// Make the file with an empty list if it is not there yet.
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");
// Read all books, and save all books.
exports.read = () => JSON.parse(fs.readFileSync(FILE));
exports.write = (books) => fs.writeFileSync(FILE, JSON.stringify(books, null, 
2));