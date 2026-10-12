const { describe, it, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const { startServer } = require("./helpers");

// A small stand-in for RAWG, so the pipeline never needs the internet or an API key
const CATALOG = [
  { id: 3328, name: "The Witcher 3: Wild Hunt", released: "2015-05-18", rating: 4.66, background_image: null, platforms: [{ platform: { name: "PC" } }], genres: [{ name: "RPG" }] },
  { id: 4200, name: "Portal 2", released: "2011-04-18", rating: 4.61, background_image: null, platforms: [{ platform: { name: "PC" } }], genres: [{ name: "Puzzle" }] },
];

function fakeRawg(url, { params }) {
  if (url !== "https://api.rawg.io/api/games") throw new Error("Unexpected call to " + url);
  const wanted = String(params.search).toLowerCase();
  const results = CATALOG.filter((game) => game.name.toLowerCase().includes(wanted));
  return Promise.resolve({ data: { results } });
}

// Cross-reference: does any search result carry the title that was searched for?
const crossReference = (results, searched) =>
  results.some((game) => game.title.toLowerCase().includes(searched.toLowerCase()));

describe("Search", () => {
  let app;

  before(async () => {
    mock.method(axios, "get", fakeRawg);
    app = await startServer();
  });

  after(async () => {
    mock.restoreAll();
    await app.stop();
  });

  it("Case 1: a game that exists -> PASSED (it is found)", async () => {
    const searched = "witcher";
    const res = await app.visitor().get("/api/lookup?title=" + encodeURIComponent(searched));

    assert.equal(res.status, 200);
    assert.ok(res.body.length >= 1, "expected at least one result");
    assert.ok(crossReference(res.body, searched), "the searched game is not among the results");
    assert.equal(res.body[0].title, "The Witcher 3: Wild Hunt");
    assert.equal(res.body[0].rawg_id, 3328);
  });

  it("Case 2: a game that does not exist -> FAILURE (nothing is found, as it should be)", async () => {
    const searched = "Definitely Not A Real Game 9000";
    const res = await app.visitor().get("/api/lookup?title=" + encodeURIComponent(searched));

    assert.equal(res.status, 200);
    assert.equal(crossReference(res.body, searched), false, "a game that does not exist was found");
    assert.deepEqual(res.body, []);
  });
});
