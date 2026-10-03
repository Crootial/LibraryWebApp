// The games page: puts the parts together and starts them.

function renderAll() {
  renderCollection();
  renderWishlist();
  renderBrowse();
  renderAccount();
}

function initGames() {
  store.back = initTabs().back;
  initAccount();
  initAddForm();
  initLookupForm();
  initFilter();

  const flash = takeFlash();
  if (flash) toast(flash);

  // The trending list is for everyone, so it loads while the page finds out who is signed in.
  // If the server can't be asked, the page carries on as a visitor's.
  loadTrending();
  api("/api/auth/me")
    .then((me) => { store.user = me.user; })
    .catch(() => { store.user = null; })
    .then(applyUser);
}
