const express = require("express");
const cors = require("cors");
const axios = require("axios");
const db = require("./db");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
// READ - get all books
app.get("/api/books", (req, res) => {
 res.json(db.read());
});
// CREATE - add a book
app.post("/api/books", (req, res) => {
 const books = db.read();
 const book = { id: Date.now(), ...req.body };
 books.push(book);
 db.write(books);
 res.json(book);
});
// UPDATE - edit a book by id
app.put("/api/books/:id", (req, res) => {
 const books = db.read();
 const book = books.find((b) => b.id == req.params.id);
 Object.assign(book, req.body);
 db.write(books);
 res.json(book);
});
// DELETE - remove a book by id
app.delete("/api/books/:id", (req, res) => {
 const books = db.read().filter((b) => b.id != req.params.id);
 db.write(books);
 res.json({ message: "Book deleted" });
});
// INTEGRATION - look up a book from an external service
app.get("/api/lookup", async (req, res) => {
 const url = "https://openlibrary.org/search.json";
 const response = await axios.get(url, { params: { title: req.query.title, 
limit: 5 } });
 const results = response.data.docs.map((doc) => ({
 title: doc.title,
 author: doc.author_name ? doc.author_name[0] : "Unknown",
 year: doc.first_publish_year,
 }));
 res.json(results);
});
app.listen(3000, () => {
 console.log("Server running at http://localhost:3000");
});