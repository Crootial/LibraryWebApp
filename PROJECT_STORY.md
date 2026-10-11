# MyGameVault: The Story of the Project

*A plain-language account of how the project began, how it changed, and what it can do today. No code, just the story.*

| | |
| --- | --- |
| **Project name** | MyGameVault (started life as "Library Web App") |
| **What it is** | A website for building a personal video game collection |
| **Type** | Course project, Integrative Programming |
| **Team** | Mendiola, Christian Kal-El B. · Miranda, Christian Dave N. · Sarmiento, Winross Therence B. |
| **Started** | 22 September 2026 |
| **Current version** | 0.1.1 (3 October 2026) |

---

## 1. How it began

The project started as a classroom exercise. The course handed every team the same small starting point: a **library website for books**. It was deliberately simple. You could list books, add one, edit one and delete one, and there was a search box that looked books up online using the free Open Library service. Everything was saved in one plain data file, so there was no database to install.

The point of the exercise was to show the full path of a web application, from a button in the browser, to the server, to stored data, and back again. The team committed that starting point on **22 September 2026** as the first entry in the project's history.

## 2. The big idea: books become games

A generic book list is not very exciting to build on, so within days the team decided to give the project a real subject: **video games**. Games come with art, platforms, ratings and release dates, which makes a collection something you want to look at, not only a table of titles.

The team switched the online search to **RAWG**, a large public video game database. That one decision shaped everything after it. Instead of typing every detail by hand, a person could search for a game, see its cover art, platforms and rating, and save it with one click.

The project was renamed **MyGameVault**.

The team also tried a different route on a side branch, using Wikidata as the source of game information. That version was not carried forward. The RAWG version gave richer information, such as cover images, genres and ratings, and became the main line of the project.

## 3. Giving it a face

On 25 September the website got its real look. The team chose a **neo-brutalist** style: thick black outlines, flat blocks of colour and bold type. The palette is deliberately small: black, deep navy, amber, light grey and white, set in the Inter typeface.

What this stage added:

- **Game cards** showing cover art, genres, a star rating, the release year and a small badge for each platform the game is on. When a game has no art, a console icon fills the space.
- **Console icons** for fifteen platforms, so a PlayStation 4 and a PlayStation 5 both show as PlayStation.
- **Look up online**, where search results can be saved to the collection in one click.
- **Safety and polish.** Game titles are always shown as plain text, and image links are only accepted from normal web addresses. The site also shows loading messages, friendly empty screens, error messages, small pop-up confirmations, and a two-step delete so nothing is lost by accident.
- **Edits that respect the data.** Changing one detail of a game no longer wipes out the information that came from RAWG.

## 4. Making it easier to navigate

The page had grown long and crowded, so later the same evening it was split into **tabs** under a bar that stays at the top of the screen.

- The tabs keep their place when you refresh the page or press the browser's Back button.
- The tabs can be used from the keyboard.
- The **My Games** tab shows a live count of how many games you own.
- Game cards gained a **Details** drop-down with the developer, publisher, release date, genres, age rating, Metacritic score, average playtime, platforms and the game's website.
- Developer and publisher can be typed in by hand for games added manually.

## 5. Learning from early problems

The first version of the Details drop-down waited for RAWG to answer before showing anything. On a slow or blocked network, people saw an error and nothing else. The team reworked it so that what is already known about a game appears **instantly**, and the extra RAWG information joins it a moment later. If the extra information cannot load, the basics stay on screen and a **Try again** button appears.

After that the team simplified the layout, grouping related facts into three tidy rows. They also removed the long game description, which made the cards heavy and the saved data bulky.

## 6. From a shared list to real accounts

The biggest step came on **3 October 2026**. Until then, everyone who opened the site saw the same collection, which is fine for a demo but not for a real product. This release added three things.

**Accounts**
- People can create an account, sign in and sign out from an Account panel at the top of the page.
- Passwords are never stored as typed. They are scrambled with a standard one-way method, and sign-ins use a secure cookie that lasts 30 days.
- Each person sees and changes only their own games.
- After too many wrong passwords in a short time, further attempts are paused to discourage guessing.
- Games saved before accounts existed are handed to the first account ever created, so nothing from the early demo was lost.

**Wishlist**
- A heart button on search results and trending games adds a game to a wishlist.
- A **Wishlist** tab keeps games the person wants but does not own yet.
- **Move to collection** turns a wished-for game into an owned one. Adding a game to the collection also removes it from the wishlist automatically.

**Home page with trending games**
- A new **Home** tab shows 12 trending games: releases from roughly the last four months that the most RAWG users have added to their libraries.
- The list refreshes hourly, so the site stays lively without overloading RAWG.

The same release made the stored data safer. If a data file ever becomes damaged, the app now stops and reports the problem instead of quietly treating it as empty and overwriting everything.

## 7. Tidying up and the first version number

The same day, the project was labelled **version 0.1.0**, the first complete feature set: search, collection, details, accounts, wishlist and trending. A version number also gives the planned deployment pipeline something to tag its builds with.

By then the page's main script had grown too large to work with comfortably. It was divided into small, focused parts, one for tabs, one for forms, one for game cards, one for accounts, and so on. Nothing the user sees changed, so this became a small patch release, **version 0.1.1**.

---

## What the app can do today

| Area | What a person can do |
| --- | --- |
| **Accounts** | Sign up, sign in, sign out; every account has its own private collection and wishlist |
| **Home** | See 12 trending recent releases and wish for them or save them |
| **My Games** | Browse, filter, edit and delete saved games; see a live game count |
| **Wishlist** | Keep a list of games to get next and move them into the collection |
| **Look up online** | Search RAWG and save a result in one click |
| **Add a game** | Enter a game by hand, including platforms, developer and publisher |
| **Details** | Open any card to see developer, publisher, ratings, playtime, platforms and website |

## Timeline

| Date | Milestone |
| --- | --- |
| 22 Sep 2026 | Course starter project, a book library, is committed |
| 25 Sep 2026 | Books become games; search switches to RAWG |
| 25 Sep 2026 | Neo-brutalist design, cover art cards and platform icons |
| 25 Sep 2026 | Tabs and the Details drop-down |
| 25 Sep 2026 | Details made to load gracefully, then simplified |
| 3 Oct 2026 | Accounts, wishlist and the trending Home page |
| 3 Oct 2026 | Version 0.1.0 |
| 3 Oct 2026 | Code reorganised into smaller parts; version 0.1.1 |

## What comes next

The remaining requirement for the course is packaging the app and setting up an automated build pipeline, using Docker and Jenkins, so that it can be built and released in a repeatable way.

## Credits

- **Game data and cover art:** [RAWG](https://rawg.io)
- **Book data in the original starter:** Open Library
- **Developers:** Mendiola, Christian Kal-El B.; Miranda, Christian Dave N.; Sarmiento, Winross Therence B.
