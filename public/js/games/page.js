function renderAll() {
  renderCollection();
  renderWishlist();
  renderBrowse();
  renderAccount();
}

function initGames() {
  store.back = initTabs().back;
  initAccount();
  initProfile();
  initPerson();
  initAddForm();
  initLookupForm();
  initFilter();

  const flash = takeFlash();
  if (flash) toast(flash);

  loadTrending();
  api("/api/auth/me")
    .then((me) => { store.user = me.user; })
    .catch(() => { store.user = null; })
    .then(applyUser);
}
