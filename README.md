# MyGameVault

A video game database web app. Search the [RAWG](https://rawg.io) game database, save the games you care about to your own collection, keep a wishlist of the ones you want next, and look up their platforms, developers, publishers and ratings later. The home page lists the games that are trending on RAWG, including big ones that are about to launch. Collections and wishlists belong to an account.


git clone https://github.com/Crootial/LibraryWebApp.git


Everything under `/api/games` and `/api/wishlist` needs a signed-in account, and only ever touches that account's own games. Adding a game (to the collection or the wishlist) needs a real account: a guest gets a 403. `/api/trending`, `/api/lookup` and `/api/auth/*` are open to everyone. Anyone can read the forum under `/api/forum` and see a profile picture; posting, voting, deleting and changing your own picture need a real account (a guest gets a 403). So do `/api/friends` and looking at another player's profile.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account from `{ "username", "password" }` and sign in to it. The sign-up form also sends `"confirmPassword"`; if it is there and differs from `password` the answer is 400 and no account is made. Usernames are 3 to 24 letters, numbers, dots, dashes or underscores. Passwords are 8 to 128 characters |
| POST | `/api/auth/login` | Sign in with `{ "username", "password" }`. After 8 wrong passwords within ten minutes, that username has to wait from that address until the ten minutes are up |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | `{ "user": { id, username, createdAt, avatarAt } }` for the signed-in account, or `{ "user": null }` |
| GET | `/api/games` | List the account's saved games |
| POST | `/api/games` | Add a game (JSON body). If it was on the wishlist it leaves the wishlist |
| PUT | `/api/games/:id` | Update a saved game with the fields in the JSON body |
| DELETE | `/api/games/:id` | Delete a saved game |
| GET | `/api/wishlist` | List the account's wishlist |
| POST | `/api/wishlist` | Put a game on the wishlist (JSON body shaped like a search result, `title` required). Answers 409 if the game is already on the wishlist or in the collection |
| DELETE | `/api/wishlist/:id` | Take a game off the wishlist |
| POST | `/api/wishlist/:id/collect` | Move a wishlist entry into the collection. Answers with the game as it now sits in the collection |
| GET | `/api/trending` | The 12 games on RAWG's own "New and trending" list, the one rawg.io shows first. It ranks by player counts and release date, so games that haven't launched yet can be in it (check `released`). Adult-only games (RAWG's Adults Only rating, or the hentai, nsfw, erotic, eroge and porn tags) are left out. That list isn't in RAWG's public docs, so if it stops answering the server falls back to the 12 games released in the last `TRENDING_DAYS` days that the most RAWG users have added. Cached for an hour |
| GET | `/api/lookup?title=...` | Search RAWG and return up to 5 matches |
| GET | `/api/lookup/:id` | RAWG details for one game: developers, publishers, website, age rating, Metacritic score and average playtime. `:id` is a RAWG game id, which saved games keep as `rawg_id` |
| GET | `/api/forum/:key/comments` | The comments on a game, newest first, with like and dislike totals, the viewer's own vote and each author's picture version (`avatarAt`). `:key` is `rawg-<RAWG id>`, or `title-<lowercase title>` for a game that has no RAWG id |
| POST | `/api/forum/:key/comments` | Post a comment from `{ "body" }`, 1 to 1000 characters. Answers 429 after 5 comments in a minute |
| POST | `/api/forum/comments/:id/vote` | Like, dislike or clear your vote from `{ "value" }`: `1` likes, `-1` dislikes, `0` clears it. Sending the same value twice changes nothing |
| DELETE | `/api/forum/comments/:id` | Delete one of your own comments |
| GET | `/api/profile/:username/avatar` | A profile picture, as a JPEG. 404 if that account has none. The page adds `?v=<avatarAt>` so a picture can be cached for good |
| PUT | `/api/profile/avatar` | Set your profile picture. The body is the JPEG itself (`Content-Type: image/jpeg`), up to 512 KB and 1024 pixels on each side. The page crops to a square and shrinks to 256 pixels first. Answers with `{ user }` |
| DELETE | `/api/profile/avatar` | Remove your profile picture. Answers with `{ user }` |
| GET | `/api/profile/:username` | Another player's profile: `{ username, avatarAt, createdAt, relation, friendCount, collection, wishlist }`. `relation` is `self`, `friends`, `requested` (you asked them), `incoming` (they asked you) or `none`. `collection` and `wishlist` (`{ total, items }`, newest first, up to 200) are only filled in for friends and for the owner; everyone else gets `null` |
| GET | `/api/friends` | `{ friends, incoming, outgoing }`: your friends, the requests waiting for your answer, and the ones you sent. Each entry is `{ username, avatarAt }` plus `since` or `sentAt` |
| POST | `/api/friends/:username` | Add someone. This asks them, or accepts if they have already asked you. Answers `{ relation }`. Asking twice changes nothing. You can have 50 requests waiting at once |
| DELETE | `/api/friends/:username` | Take back whatever is between you: cancel your request, decline theirs, or unfriend. Answers 404 if there was nothing |

## Project files

```text

server.js         Express server and the API routes
auth.js           Accounts: password hashing, sign-in sessions and the /api/auth routes
profile.js        Profile pictures and other players' profiles: the /api/profile routes
friends.js        Friends and friend requests: the /api/friends routes
db.js             Reads and writes the JSON files and the profile pictures
library.json      The saved games
wishlist.json     The wishlists (created when the server first starts)
users.json        The accounts, with hashed passwords (created when the server first starts)
sessions.json     The sign-ins that are still good (created when the server first starts)
comments.json     The forum comments and who liked or disliked them (created when the server first starts)
friends.json      Who is friends with whom, and the requests waiting (created when the server first starts)
avatars/          The profile pictures, one JPEG per account (created when the first one is saved)
package.json      Dependencies
public/           The web page, served as it is
  index.html      The tabbed page: Home, My Games, Wishlist, Look up online, Add a game, and the Account panel
  edit.html       The edit form for one game
  app.js          Starts the games page or the edit page; the logic is in js/ and js/games/
  platforms.js    The list of consoles and how RAWG's platform names map to them
  style.css       Styles
  icons.svg       Console and interface icons
  favicon.svg     Tab icon
```

## Core functions

| Area | What it does | Where |
| --- | --- | --- |
| Accounts | Register, sign in and out. Passwords are hashed with scrypt, sign-ins are cookie sessions, and failed logins are rate limited. A visitor with no session is given a temporary guest account by `GET /api/auth/me`, which can browse and search, but adding games, forum posts, friends and profile changes need a real account | `auth.js` |
| Collection | Save, edit and delete games. Each game belongs to one account (`userId`) | `server.js` (`/api/games`) |
| Wishlist | Games you want next. Adding a game to the collection removes it from the wishlist, and a wishlist entry can be moved to the collection in one call. Duplicates are matched by RAWG id or lowercase title (`sameGame`) | `server.js` (`/api/wishlist`) |
| Look up | Searches RAWG, returns the top 5 matches (`summarize`) and fetches full details for one game | `server.js` (`/api/lookup`) |
| Trending | RAWG's "New and trending" list with adult-only games filtered out (`adultOnly`), repeats removed, cached for an hour, and refreshed by a single shared request (`refreshTrending`). It serves the stale cache if RAWG fails | `server.js` (`/api/trending`) |
| Forum | Comments per game, keyed by `forumKey` (`rawg-<id>` or `title-<title>`), with likes and dislikes (one vote per account) and a posting rate limit | `server.js` (`/api/forum`) |
| Profiles | Profile pictures (JPEG, validated by `jpegSize`) and other players' profiles. Collections and wishlists are only shown to friends and to the owner | `profile.js` |
| Friends | Requests, accepting, declining, cancelling and unfriending. `relation()` works out how two accounts are connected | `friends.js` |
| Storage | `table()` and the `avatars` helper read and write the data files, and `newId()` makes ids | `db.js` |
| Errors | Routes have no try/catch of their own: Express 5 passes anything they throw to the one error handler at the end of `server.js`, which answers `{ "error": "..." }` | `server.js` |

## How the database works

There is no database server. The data lives in plain JSON files, read and written by `db.js`.

- `db.js` exposes one `table(name)` per file, each with `read()` (returns the whole list) and `write(list)` (replaces the file). A file that doesn't exist yet is created as `[]` on startup.
- Every route follows the same pattern: `read()` the whole list, change it in memory, then `write()` it back. There are no queries or indexes, so filtering by owner or looking things up is done with `Array.filter` and `Array.find`. That is simple and readable, and fine for a small app. Writes are not locked, so it is not meant for many writers at once.
- `newId(list)` makes numeric ids from the current time, moved past the highest id already in the list so two ids never collide. Accounts use random UUIDs instead.
- Files live in `DATA_DIR` (default: next to `server.js`). Profile pictures are separate JPEG files in `avatars/`, written to a `.tmp` file and then renamed so nobody reads half a picture.

| File | Holds | Main fields |
| --- | --- | --- |
| `library.json` | Saved games | `id`, `userId`, `rawg_id`, `title`, `released`, `rating`, `image`, `platforms[]`, `genres[]` |
| `wishlist.json` | Wishlist entries, same shape as saved games | same as above |
| `users.json` | Accounts | `id`, `username`, `key` (lowercase username), `passwordHash`, `createdAt`, `avatarAt`, `isGuest` |
| `sessions.json` | Active sign-ins | `token` (SHA-256 of the cookie token), `userId`, `expires` |
| `comments.json` | Forum comments | `id`, `gameKey`, `userId`, `username`, `body`, `createdAt`, `votes` (`{ userId: 1 or -1 }`) |
| `friends.json` | One record per pair of accounts | `id`, `from`, `to`, `status` (`pending` or `accepted`), `createdAt`, `acceptedAt` |
| `avatars/<userId>.jpg` | Profile pictures | the JPEG itself |

Records are linked by `userId`, so a game, comment or friend request always points back to its account in `users.json`.

## API usage

The API is JSON over HTTP on the same port as the page (default `http://localhost:3000`). The full list of routes is in the table above. Sign-in is a cookie, so with `curl` keep it in a cookie jar (`-c` saves it, `-b` sends it).

```bash
# Create an account (this also signs you in) and keep the cookie
curl -c jar.txt -H "Content-Type: application/json" \
  -d '{"username":"player1","password":"correct horse battery"}' \
  http://localhost:3000/api/auth/register

# Search RAWG (no sign-in needed)
curl "http://localhost:3000/api/lookup?title=hades"

# Save a game to your collection
curl -b jar.txt -H "Content-Type: application/json" \
  -d '{"title":"Hades","rawg_id":274755,"released":"2020-09-17","platforms":["PC"],"genres":["Action"]}' \
  http://localhost:3000/api/games

# List your collection
curl -b jar.txt http://localhost:3000/api/games

# Edit it, then delete it (use the id from the previous response)
curl -b jar.txt -X PUT -H "Content-Type: application/json" -d '{"rating":4.5}' http://localhost:3000/api/games/<id>
curl -b jar.txt -X DELETE http://localhost:3000/api/games/<id>
```

Status codes: `200`/`201` success, `400` bad input, `403` a guest tried something that needs a real account, `404` not found, `409` already exists (for example a duplicate wishlist entry), `429` too many attempts, `500` a server or file error. Errors come back as `{ "error": "message" }`.

## Accounts

The data lives in plain JSON files next to `server.js`, in the same way as `library.json`. Each saved game and wishlist entry carries the `userId` of the account that owns it.

- **Passwords** are hashed with scrypt, which comes with Node, and saved as `scrypt$N$r$p$salt$hash`. The password itself is never stored.
- **Signing in** gives the browser a random token in an `HttpOnly`, `SameSite=Lax` cookie that lasts 30 days. `sessions.json` keeps only a fingerprint (SHA-256) of each token, so a copy of that file can't be used to sign in. Signing out removes the session. Set `COOKIE_SECURE=true` when the site is served over HTTPS behind a proxy.
- **Games saved before accounts existed** have no owner. The first account that is ever created takes them over, so create your own account first.
- **Profile pictures** are saved as files in `avatars/`, named after the account id, not inside `users.json`. The server only takes a JPEG of up to 512 KB and 1024 pixels on each side, and checks the size in the file's header before keeping it. `users.json` holds `avatarAt`, the time the picture was set, which is also the version in the picture's address.
- **Friends** are one record per pair of accounts in `friends.json`: a request from one account to another, which becomes a friendship when it is accepted. Adding someone who has already asked you accepts their request.
- **Who sees what.** Any signed-in player can open another player's profile from their name in a game's forum, and sees their name, picture, join date and number of friends. Their collection and wishlist go only to their friends (and to them). A guest or a signed-out visitor can't open profiles.
- `users.json`, `sessions.json`, `wishlist.json`, `comments.json`, `friends.json` and `avatars/` are listed in `.gitignore`. Don't commit them.

Environment variables, all optional: `PORT` (default 3000), `DATA_DIR` (where the JSON files are kept, default the folder of `server.js`), `RAWG_API_KEY`, `TRENDING_DAYS` (how far back the fallback trending list looks, default 120) and `COOKIE_SECURE`.

## Tests and the Jenkins pipeline

`npm test` runs the automated tests in `test/` with Node's built-in test runner (no extra packages). They start the app on a random port with an empty temporary `DATA_DIR`, so they never touch your own data, and RAWG is replaced by a small stand-in, so they need no internet or API key.

Each case from the test plan is a test. A case marked PASSED must succeed. A case marked FAILURE must be refused by the app, so that test is green when the app says no.

| File | Cases |
| --- | --- |
| `test/search.test.js` | Search a game that exists (found) and one that does not (nothing found) |
| `test/signup.test.js` | Matching passwords (account made) and mismatching passwords (refused) |
| `test/login.test.js` | Right/right signs in; right/wrong, wrong/right and wrong/wrong are refused |
| `test/collection.test.js` | A signed-in user adds to the collection and wishlist; a guest is refused |
| `test/forum.test.js` | A signed-in user posts a comment; a signed-out visitor is refused |

The `Jenkinsfile` runs everything in Docker, so Jenkins only needs Docker and the JUnit plugin: build the `test` stage of the `Dockerfile`, lint, run the tests and publish `junit.xml`, then build the `runtime` image. To run the same thing by hand:

```bash
docker build --target test -t librarywebapp-test .
docker run --rm librarywebapp-test
```

### Trying the pipeline on your own machine

`jenkins/` holds a Jenkins that is already set up with the pipeline job, so there is nothing to click through. It needs only Docker:

```bash
cd jenkins
docker compose up -d --build
```

Open http://localhost:8080 and sign in as `admin` with the password `admin` (set `JENKINS_ADMIN_PASSWORD` to change it), then press **Build Now** on `librarywebapp`. The first start takes a minute or two.

- Jenkins checks the code out with git, so it builds what is **committed** on `main` (set `REPO_BRANCH` for another branch). Commit before you build.
- It uses your own Docker through the mounted socket, so the images the pipeline builds (`librarywebapp:<build number>`) show up in `docker images`.
- It listens on `127.0.0.1` only. Anyone who can use this Jenkins can control your Docker, so don't expose it.
- `docker compose down -v` removes it and its build history.

## Troubleshooting

**The terminal prints `Server running at http://localhost:3000`, then straight back to the prompt**

The server did not start. Something is already using port 3000, often an earlier copy of this server that is still running. The server prints its "running" line even when it could not start, so there is no error to see. Your browser shows whatever program holds the port, which may be an old copy of the app.

Stop the other copy with `Ctrl+C` in the terminal where it runs, or find it and end it. On Windows, the PID is the last column of the line marked LISTENING:

Developers:
Mendiola, Christian Kal-El B.
Miranda, Christian Dave N.
Sarmiento, Winross Therence B.




