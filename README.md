# MyGameVault

A video game database web app. Search the [RAWG](https://rawg.io) game database, save the games you care about to your own collection, keep a wishlist of the ones you want next, and look up their platforms, developers, publishers and ratings later. The home page lists the games that are trending on RAWG. Collections and wishlists belong to an account.


git clone https://github.com/Crootial/LibraryWebApp.git


Everything under `/api/games` and `/api/wishlist` needs a signed-in account, and only ever touches that account's own games. `/api/trending`, `/api/lookup` and `/api/auth/*` are open to everyone.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account from `{ "username", "password" }` and sign in to it. Usernames are 3 to 24 letters, numbers, dots, dashes or underscores. Passwords are 8 to 128 characters |
| POST | `/api/auth/login` | Sign in with `{ "username", "password" }`. After 8 wrong passwords within ten minutes, that username has to wait from that address until the ten minutes are up |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | `{ "user": { id, username, createdAt } }` for the signed-in account, or `{ "user": null }` |
| GET | `/api/games` | List the account's saved games |
| POST | `/api/games` | Add a game (JSON body). If it was on the wishlist it leaves the wishlist |
| PUT | `/api/games/:id` | Update a saved game with the fields in the JSON body |
| DELETE | `/api/games/:id` | Delete a saved game |
| GET | `/api/wishlist` | List the account's wishlist |
| POST | `/api/wishlist` | Put a game on the wishlist (JSON body shaped like a search result, `title` required). Answers 409 if the game is already on the wishlist or in the collection |
| DELETE | `/api/wishlist/:id` | Take a game off the wishlist |
| POST | `/api/wishlist/:id/collect` | Move a wishlist entry into the collection. Answers with the game as it now sits in the collection |
| GET | `/api/trending` | The 12 games released in the last 120 days that the most RAWG users have added to their libraries. Cached for an hour |
| GET | `/api/lookup?title=...` | Search RAWG and return up to 5 matches |
| GET | `/api/lookup/:id` | RAWG details for one game: developers, publishers, website, age rating, Metacritic score and average playtime. `:id` is a RAWG game id, which saved games keep as `rawg_id` |


server.js         Express server and the API routes
auth.js           Accounts: password hashing, sign-in sessions and the /api/auth routes
db.js             Reads and writes the JSON files
library.json      The saved games
wishlist.json     The wishlists (created when the server first starts)
users.json        The accounts, with hashed passwords (created when the server first starts)
sessions.json     The sign-ins that are still good (created when the server first starts)
package.json      Dependencies
public/           The web page, served as it is
  index.html      The tabbed page: Home, My Games, Wishlist, Look up online, Add a game, and the Account panel
  edit.html       The edit form for one game
  app.js          The page's logic
  platforms.js    The list of consoles and how RAWG's platform names map to them
  style.css       Styles
  icons.svg       Console and interface icons
  favicon.svg     Tab icon
```

## Accounts

The data lives in plain JSON files next to `server.js`, in the same way as `library.json`. Each saved game and wishlist entry carries the `userId` of the account that owns it.

- **Passwords** are hashed with scrypt, which comes with Node, and saved as `scrypt$N$r$p$salt$hash`. The password itself is never stored.
- **Signing in** gives the browser a random token in an `HttpOnly`, `SameSite=Lax` cookie that lasts 30 days. `sessions.json` keeps only a fingerprint (SHA-256) of each token, so a copy of that file can't be used to sign in. Signing out removes the session. Set `COOKIE_SECURE=true` when the site is served over HTTPS behind a proxy.
- **Games saved before accounts existed** have no owner. The first account that is ever created takes them over, so create your own account first.
- `users.json`, `sessions.json` and `wishlist.json` are listed in `.gitignore`. Don't commit them.

Environment variables, all optional: `PORT` (default 3000), `DATA_DIR` (where the JSON files are kept, default the folder of `server.js`), `RAWG_API_KEY`, `TRENDING_DAYS` (how far back the trending list looks, default 120) and `COOKIE_SECURE`.

## Troubleshooting

**The terminal prints `Server running at http://localhost:3000`, then straight back to the prompt**

The server did not start. Something is already using port 3000, often an earlier copy of this server that is still running. The server prints its "running" line even when it could not start, so there is no error to see. Your browser shows whatever program holds the port, which may be an old copy of the app.

Stop the other copy with `Ctrl+C` in the terminal where it runs, or find it and end it. On Windows, the PID is the last column of the line marked LISTENING:

Developers:
Mendiola, Christian Kal-El B.
Miranda, Christian Dave N.
Sarmiento, Winross Therence B.