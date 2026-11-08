/* EMERGENCY CONTACT FALLBACK - use only if email-reveal API or CAPTCHA malfunctions.
 * Replace assets/email-reveal.js with this module (and purge that asset from CDN).
 * No email addresses are embedded or revealed; all controls link to the live contact form.
 * Do not change customer lead Worker, Make webhook, or Turnstile contact-form widget.
 */
(() => {
  "use strict";
  const CONTACT = "/#contact";
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-email-reveal]");
    if (!trigger) return;
    event.preventDefault();
    window.location.assign(CONTACT);
  });
})();
