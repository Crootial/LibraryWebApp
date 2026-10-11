const pages = { games: () => initGames(), edit: () => initEdit() };
pages[document.body.dataset.page]?.();
