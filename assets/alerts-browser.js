/* Progressive enhancement: all article cards remain in the initial HTML for crawlers
   and visitors without JavaScript. The interface reduces visual scrolling only. */
(() => {
  "use strict";
  const grid = document.querySelector("#updates .alerts-grid");
  const panel = document.getElementById("alerts-browser");
  if (!grid || !panel) return;

  const cards = [...grid.querySelectorAll(":scope > .alerts-card")];
  const input = panel.querySelector("#alerts-search");
  const topic = panel.querySelector("#alerts-topic");
  const more = document.getElementById("alerts-more");
  const status = panel.querySelector("#alerts-result-count");
  const empty = document.getElementById("alerts-empty");
  const pageSize = 4;
  let shown = pageSize;

  function categoryOf(card) {
    const raw = (card.dataset.topic || card.querySelector(".alerts-tag")?.textContent || "").toLowerCase();
    if (/scam|fraud|phish|payment|bank/.test(raw)) return "scams";
    if (/employee|awareness|guide|checklist|habits/.test(raw)) return "guides";
    return "alerts";
  }
  function update(resetPage = false) {
    if (resetPage) shown = pageSize;
    const query = input.value.trim().toLocaleLowerCase();
    const category = topic.value;
    const matches = cards.filter(card => {
      const text = card.textContent.toLocaleLowerCase();
      return (!query || text.includes(query)) && (category === "all" || categoryOf(card) === category);
    });
    const visible = new Set(matches.slice(0, shown));
    for (const card of cards) card.hidden = !visible.has(card);
    const visibleCount = Math.min(shown, matches.length);
    status.textContent = matches.length === 0
      ? "No articles match your search."
      : "Showing " + visibleCount + " of " + matches.length + " article" +
        (matches.length === 1 ? "" : "s") + ".";
    empty.hidden = matches.length !== 0;
    more.hidden = visibleCount >= matches.length;
  }
  input.addEventListener("input", () => update(true));
  topic.addEventListener("change", () => update(true));
  more.addEventListener("click", () => { shown += pageSize; update(); });
  panel.hidden = false;
  update(true);
})();