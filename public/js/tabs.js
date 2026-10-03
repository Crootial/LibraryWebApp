// ---------- Tabs ----------

// The Account panel has no tab of its own: the button in the masthead opens it.
const PANEL_NAMES = ["home", "collection", "wishlist", "lookup", "add", "account"];

// The games page holds six panels, five of them behind the tab bar. Choosing a tab shows its
// panel and hides the others. The address keeps the choice (index.html#lookup), so a refresh,
// the back button and the links on the edit page all land on the right tab.
// It gives back back(): the panel that was open before the Account one, where signing in returns to.
function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll(".panel")];
  const bar = document.querySelector(".tabbar");
  let shown = "home";
  let before = "home";

  const fromAddress = () => {
    const name = location.hash.slice(1);
    return PANEL_NAMES.includes(name) ? name : "home";
  };

  // On a narrow screen the tabs scroll sideways, so slide the chosen one into view.
  function keepInView(tab) {
    const strip = tab.parentElement;
    const over = tab.offsetLeft + tab.offsetWidth + 8 - (strip.scrollLeft + strip.clientWidth);
    if (over > 0) strip.scrollLeft += over;
    else if (tab.offsetLeft - 8 < strip.scrollLeft) strip.scrollLeft = Math.max(0, tab.offsetLeft - 8);
  }

  function show(name) {
    if (shown !== "account" && name !== shown) before = shown;
    shown = name;
    for (const panel of panels) panel.hidden = panel.id !== "panel-" + name;
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) keepInView(tab);
    }
    // With the Account panel open no tab is chosen, so the first stays reachable by keyboard.
    if (!tabs.some((tab) => tab.tabIndex === 0)) tabs[0].tabIndex = 0;
    // If the page was scrolled down, bring the new panel's top back under the tab bar.
    const gap = $("panel-" + name).getBoundingClientRect().top - bar.getBoundingClientRect().height;
    if (gap < 0) window.scrollBy(0, gap - 16);
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => { location.hash = tab.dataset.tab; });
  }

  // The arrow keys move along the tabs, and Home and End jump to the ends.
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
    // A link inside the panel that just hid would lose focus, so hand focus to the current tab.
    const active = document.activeElement;
    if (active === document.body || active.closest("[hidden]")) {
      tabs.find((tab) => tab.tabIndex === 0).focus({ preventScroll: true });
    }
  });
  show(fromAddress());
  return { back: () => before };
}
