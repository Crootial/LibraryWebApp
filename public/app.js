// MyGameVault front end. This file only picks the setup function for the page that loaded; the
// code it runs lives in the files loaded before it (see the script tags in index.html and edit.html):
//
//   js/helpers.js       building elements, the API call, toasts, busy buttons
//   js/game-view.js     reading a game and drawing the parts of a card
//   js/game-details.js  the Details dropdown on a card
//   js/forms.js         the platform picker and form errors
//   js/tabs.js          the tab bar on the games page
//   js/games/*.js       the games page: collection, wishlist, browse, account
//   js/edit.js          the edit page

// Each page loads only its own setup file, so look the function up when it is needed.
const pages = { games: () => initGames(), edit: () => initEdit() };
pages[document.body.dataset.page]?.();
