/* Suncoast verified email reveal: staged feature, not deployed to production.
 * Address values are NEVER embedded in static files. A verified, one-time
 * Turnstile token is validated server-side before the Worker returns an alias.
 */
(() => {
  "use strict";
  const SITEKEY = "0x4AAAAAAF4tQwhQiUBOGQe0"; // Public Cloudflare sitekey, NOT a secret.
  const ENDPOINT = "/api/email-reveal";
  const API_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const SELECTOR = "[data-email-reveal]";
  let active = null;
  let scriptPromise = null;

  function challengeApi() {
    if (window.turnstile && typeof window.turnstile.render === "function") {
      return Promise.resolve(window.turnstile);
    }
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = API_SCRIPT;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (window.turnstile && typeof window.turnstile.render === "function") resolve(window.turnstile);
          else reject(new Error("Turnstile was not initialized"));
        };
        script.onerror = () => reject(new Error("Turnstile script could not load"));
        document.head.appendChild(script);
      } else {
        // Some pages already load Turnstile for their existing contact form.
        // Wait for that script rather than loading the API a second time.
        let checks = 0;
        const interval = window.setInterval(() => {
          if (window.turnstile && typeof window.turnstile.render === "function") {
            window.clearInterval(interval);
            resolve(window.turnstile);
          } else if (++checks >= 100) {
            window.clearInterval(interval);
            reject(new Error("Turnstile initialization timed out"));
          }
        }, 100);
      }
    }).catch(err => {
      scriptPromise = null;
      throw err;
    });
    return scriptPromise;
  }

  function setStatus(state, text) {
    if (!active || active !== state) return;
    state.status.textContent = text;
  }
  function close() {
    const state = active;
    if (!state) return;
    active = null;
    state.modal.remove();
    if (state.widgetId !== null && window.turnstile && window.turnstile.remove) {
      try { window.turnstile.remove(state.widgetId); } catch (_) { /* best effort */ }
    }
    document.removeEventListener("keydown", state.keydown);
    if (state.trigger && state.trigger.isConnected) state.trigger.focus();
  }
  function open(mailbox, trigger) {
    if (!["sales", "partners"].includes(mailbox)) return;
    if (active) close();
    const modal = document.createElement("div");
    modal.className = "sc-email-shade";
    modal.innerHTML =
      '<section class="sc-email-panel" role="dialog" aria-modal="true" aria-labelledby="sc-email-heading">' +
      '<button type="button" class="sc-email-close" aria-label="Close email verification">×</button>' +
      '<h2 id="sc-email-heading">Show ' + (mailbox === "sales" ? "Sales" : "Partners") + ' email</h2>' +
      '<p>Complete this security check to reveal our email address. No account is required.</p>' +
      '<div class="sc-email-challenge"></div>' +
      '<p class="sc-email-status" role="status" aria-live="polite">Loading security check…</p>' +
      '<div class="sc-email-result" hidden></div>' +
      '<p class="sc-email-alternatives">Prefer not to verify? ' +
      '<a href="/#contact">Use our contact form</a> or ' +
      '<a href="tel:17276479000">call (727) 647-9000</a>.</p>' +
      '</section>';
    const state = {
      modal,
      trigger,
      widgetId: null,
      status: modal.querySelector(".sc-email-status"),
      result: modal.querySelector(".sc-email-result"),
      keydown: event => {
        if (event.key === "Escape") close();
        if (event.key === "Tab") {
          const controls = [...modal.querySelectorAll("button,a,[tabindex]:not([tabindex='-1'])")]
            .filter(el => !el.disabled && el.getClientRects().length);
          if (!controls.length) return;
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            last.focus(); event.preventDefault();
          } else if (!event.shiftKey && document.activeElement === last) {
            first.focus(); event.preventDefault();
          }
        }
      }
    };
    active = state;
    modal.querySelector(".sc-email-close").addEventListener("click", close);
    modal.addEventListener("click", event => { if (event.target === modal) close(); });
    document.body.appendChild(modal);
    document.addEventListener("keydown", state.keydown);
    modal.querySelector(".sc-email-close").focus();
    challengeApi().then(api => {
      if (active !== state) return;
      setStatus(state, "Complete the verification to show the address.");
      state.widgetId = api.render(modal.querySelector(".sc-email-challenge"), {
        sitekey: SITEKEY,
        action: "email_reveal",
        appearance: "always",
        execution: "render",
        callback: token => reveal(state, mailbox, token),
        "error-callback": () => setStatus(state, "Verification could not load. Try again, or use the contact form."),
        "expired-callback": () => setStatus(state, "Your check expired. Please complete a fresh check."),
        "timeout-callback": () => setStatus(state, "Verification timed out. Please try again.")
      });
    }).catch(() => setStatus(state, "Security check unavailable. Please use the contact form or call us."));
  }

  async function reveal(state, mailbox, token) {
    if (active !== state) return;
    setStatus(state, "Checking verification…");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        mode: "same-origin",
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox, token })
      });
      if (active !== state) return;
      if (!response.ok) throw new Error("Verification rejected or service unavailable");
      const data = await response.json();
      if (typeof data.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        throw new Error("Unexpected response");
      }
      const link = document.createElement("a");
      link.href = "mailto:" + data.email;
      link.textContent = data.email;
      state.result.replaceChildren(link);
      state.result.hidden = false;
      setStatus(state, "Email address verified. Select the address to open your email app.");
      link.focus();
    } catch (_) {
      if (active !== state) return;
      setStatus(state, "Could not reveal email right now. Please use the contact form or phone.");
      if (window.turnstile && state.widgetId !== null) {
        try { window.turnstile.reset(state.widgetId); } catch (_) { /* best effort */ }
      }
    }
  }

  document.addEventListener("click", event => {
    const trigger = event.target.closest(SELECTOR);
    if (!trigger || trigger.disabled) return;
    event.preventDefault();
    open(trigger.dataset.emailReveal, trigger);
  });
})();
