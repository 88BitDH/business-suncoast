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

  function topicsOf(card) {
    // Explicit topic assignments support articles relevant to more than one category.
    // Legacy cards and queued data-topic cards remain supported.
    const assigned = (card.dataset.topics || card.dataset.topic || "").toLowerCase().trim();
    if (assigned) return assigned.split(/[\s,|]+/).filter(Boolean);
    const label = (card.querySelector(".alerts-tag")?.textContent || "").toLowerCase();
    const title = (card.querySelector("h3")?.textContent || "").toLowerCase();
    const topics = new Set();
    if (/security alert|vulnerabilit|cisa/.test(label)) topics.add("alerts");
    if (/scam|fraud|phish|payment|bank/.test(label + " " + title)) topics.add("scams");
    if (/employee|awareness|guide|checklist|habits/.test(label)) topics.add("guides");
    return topics.size ? [...topics] : ["alerts"];
  }
  function update(resetPage = false) {
    if (resetPage) shown = pageSize;
    const query = input.value.trim().toLocaleLowerCase();
    const category = topic.value;
    const matches = cards.filter(card => {
      const text = card.textContent.toLocaleLowerCase();
      return (!query || text.includes(query)) && (category === "all" || topicsOf(card).includes(category));
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