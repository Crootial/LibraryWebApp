const PANEL_NAMES = ["home", "collection", "wishlist", "lookup", "add", "account", "game", "user"];

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll(".panel")];
  const bar = document.querySelector(".tabbar");
  let shown = "home";
  let shownHash = location.hash;
  let before = "home";

  const fromAddress = () => {
    const raw = location.hash.slice(1);
    const name = raw.split(/[:?&]/)[0];
    return PANEL_NAMES.includes(name) ? name : "home";
  };

  function keepInView(tab) {
    const strip = tab.parentElement;
    const over = tab.offsetLeft + tab.offsetWidth + 8 - (strip.scrollLeft + strip.clientWidth);
    if (over > 0) strip.scrollLeft += over;
    else if (tab.offsetLeft - 8 < strip.scrollLeft) strip.scrollLeft = Math.max(0, tab.offsetLeft - 8);
  }

  function show(name) {
    if (shown !== "account" && shown !== "game" && shown !== "user" && name !== shown) before = shown;
    // A game opened from a profile's shelves goes back to that profile, not to the tab before it
    else if (shown === "account" && name === "game") before = "account";
    else if (shown === "user" && name === "game") before = shownHash.slice(1);
    shown = name;
    shownHash = location.hash;
    for (const panel of panels) panel.hidden = panel.id !== "panel-" + name;
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) keepInView(tab);
    }
    // Ensure first tab remains keyboard-accessible if none selected
    if (!tabs.some((tab) => tab.tabIndex === 0)) tabs[0].tabIndex = 0;
    const currentPanel = $("panel-" + name);
    if (currentPanel) {
      const gap = currentPanel.getBoundingClientRect().top - bar.getBoundingClientRect().height;
      if (gap < 0) window.scrollBy(0, gap - 16);
    }
    window.dispatchEvent(new CustomEvent("tab-shown", { detail: { name, hash: location.hash } }));
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => { location.hash = tab.dataset.tab; });
  }

  $("tab-collection").parentElement.addEventListener("keydown", (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const last = tabs.length - 1;
    const next = { ArrowRight: at === last ? 0 : at + 1, ArrowLeft: at === 0 ? last : at - 1, Home: 0, End: last }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    tabs[next].focus();
    location.hash = tabs[next].dataset.tab;
  });

  window.addEventListener("hashchange", () => {
    show(fromAddress());
    const active = document.activeElement;
    if (active === document.body || active.closest("[hidden]")) {
      tabs.find((tab) => tab.tabIndex === 0).focus({ preventScroll: true });
    }
  });
  show(fromAddress());
  return { back: () => before };
}
