const axios = require("axios");
const { platformIds } = require("./platforms");
const ACTION_API = "https://www.wikidata.org/w/api.php";
const REST_API = "https://www.wikidata.org/w/rest.php/wikibase/v1";
// Wikimedia asks every client to say who it is.
const HEADERS = { "User-Agent": "MyGames/1.0 (student project; https://github.com/Crootial/LibraryWebApp)" };
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
// The values stored under one property of a game, such as its platforms (P400).
// A game with a detail missing is still worth showing, so a failed request gives an empty list.
async function statements(id, property) {
 try {
  const res = await axios.get(REST_API + "/entities/items/" + id + "/statements", {
   headers: HEADERS,
   params: { property },
   timeout: 4000,
  });
  return (res.data[property] || [])
   .filter((s) => s.rank !== "deprecated" && s.value.type === "value")
   .map((s) => s.value.content);
 } catch (err) {
  return [];
 }
}
// Readable names for item ids, for example Q19610114 becomes "Nintendo Switch".
async function namesFor(ids) {
 const names = {};
 const replies = await Promise.all(
  chunk([...new Set(ids)], 50).map((batch) =>
   axios.get(ACTION_API, {
    headers: HEADERS,
    params: { action: "wbgetentities", ids: batch.join("|"), props: "labels", languages: "en|mul", format: "json" },
    timeout: 6000,
   })
  )
 );
 for (const { data } of replies) {
  for (const item of Object.values(data.entities)) {
   const label = item.labels && (item.labels.en || item.labels.mul);
   if (!label) continue;
   names[item.id] = label.value;
   // An item that was merged into another one is answered under the new id.
   if (item.redirects) names[item.redirects.from] = label.value;
  }
 }
 return names;
}
// Search Wikidata for video games. Gives back [{ title, developer, year, platforms }].
exports.searchGames = async (title) => {
 // Only items that are an instance of "video game" (Q7889), best match first.
 const found = await axios.get(ACTION_API, {
  headers: HEADERS,
  params: { action: "query", list: "search", srsearch: title + " haswbstatement:P31=Q7889", srnamespace: 0, srlimit: 5, format: "json" },
  timeout: 6000,
 });
 const ids = found.data.query.search.map((hit) => hit.title);
 if (!ids.length) return [];
 // Platforms (P400), developers (P178) and release dates (P577) of every game, all at once.
 const details = await Promise.all(
  ids.map(async (id) => {
   const [platforms, developers, dates] = await Promise.all([
    statements(id, "P400"),
    statements(id, "P178"),
    statements(id, "P577"),
   ]);
   const years = dates
    .filter((d) => d && d.time)
    .map((d) => parseInt(d.time.slice(1, 5), 10))
    .filter(Number.isFinite);
   return { platforms, developers, year: years.length ? Math.min(...years) : null };
  })
 );
 const names = await namesFor(ids.concat(...details.map((d) => d.platforms.concat(d.developers.slice(0, 1)))));
 return ids
  .map((id, i) => {
   const known = platformIds(details[i].platforms.map((p) => names[p]).filter(Boolean));
   return {
    title: names[id],
    developer: names[details[i].developers[0]] || "Unknown",
    year: details[i].year,
    platforms: known.length ? known.slice(0, 6) : ["other"],
   };
  })
  .filter((game) => game.title);
};
