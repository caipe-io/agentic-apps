/** Switch panels without fragment navigation, which can scroll the embedding Grid shell. */
export function createReportSections({ root = document, sections, onSelect }) {
  const nav = root.getElementById("reportNav");
  const tabs = [...nav.querySelectorAll('[role="tab"]')];
  let selected = "overview", available = false;
  function render() {
    nav.hidden = !available;
    for (const tab of tabs) {
      const active = tab.dataset.section === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const [section, id] of Object.entries(sections)) {
      root.getElementById(id).hidden = available ? section !== selected : section !== "overview";
    }
  }
  const click = event => {
    const tab = event.target.closest('[role="tab"]');
    if (tabs.includes(tab)) onSelect(tab.dataset.section);
  };
  const keydown = event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onSelect(tabs[next].dataset.section);
    tabs[next].focus({ preventScroll: true });
  };
  nav.addEventListener("click", click);
  nav.addEventListener("keydown", keydown);
  render();
  return {
    select(section) { selected = Object.hasOwn(sections, section) ? section : "overview"; render(); },
    setAvailable(value) { available = value; render(); },
    dispose() { nav.removeEventListener("click", click); nav.removeEventListener("keydown", keydown); },
  };
}
