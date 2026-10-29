// Progressive enhancement for Suncoast's business lead form.
// Disabled until data-otp-api is configured after the Worker is deployed.
(function () {
  "use strict";
  const loader = document.currentScript;
  const endpoint = (loader && loader.getAttribute("data-otp-api") || "").replace(/\/$/, "");
  const form = document.getElementById("leadForm");
  if (!endpoint || !/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/_-]*)?$/i.test(endpoint) || !form) return;

  const email = form.elements.email;
  const submit = document.getElementById("leadSubmitBtn");
  if (!email || !submit) return;

  let challengeId = "";
  let proofToken = "";
  let busy = false;
  const initialSubmitLabel = submit.textContent.trim();
  submit.disabled = true;
  const initialStatus = document.createElement("div");
  initialStatus.className = "otp-controls";
  initialStatus.innerHTML = [
    '<p class="otp-heading">Verify your email to send your request</p>',
    '<p class="otp-hint">We will email you a six-digit code. Your address must be verified before sending the inquiry.</p>',
    '<button type="button" class="otp-button" id="otpSend">Email me a code</button>',
    '<div id="otpCodeBox" hidden>',
      '<label for="otpCode">Six-digit code</label>',
      '<input id="otpCode" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" aria-label="Email verification code">',
      '<button type="button" class="otp-button" id="otpVerify">Verify code</button>',
    '</div>',
    '<p role="status" aria-live="polite" id="otpStatus"></p>'
  ].join("");
  email.insertAdjacentElement("afterend", initialStatus);

  const sendButton = document.getElementById("otpSend");
  const codeBox = document.getElementById("otpCodeBox");
  const codeInput = document.getElementById("otpCode");
  const verifyButton = document.getElementById("otpVerify");
  const status = document.getElementById("otpStatus");
  const proofInput = document.createElement("input");
  proofInput.type = "hidden";
  proofInput.name = "otp_token";
  form.appendChild(proofInput);

  function report(message, error) {
    status.textContent = message;
    status.classList.toggle("otp-error", Boolean(error));
  }
  function setBusy(value) {
    busy = value;
    sendButton.disabled = value;
    verifyButton.disabled = value;
    submit.disabled = value || !proofToken;
  }
  function resetVerification() {
    challengeId = "";
    proofToken = "";
    proofInput.value = "";
    codeInput.value = "";
    codeBox.hidden = true;
    submit.disabled = true;
    sendButton.hidden = false;
    report("", false);
  }
  function resetTurnstile() {
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      window.turnstile.reset();
    }
  }
  function turnstileValue() {
    return form.querySelector('[name="cf-turnstile-response"]')?.value || "";
  }
  async function request(path, payload) {
    const response = await fetch(endpoint + path, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Unable to complete verification. Try again.");
    }
    return result;
  }

  email.addEventListener("input", () => {
    if (!busy) resetVerification();
  });

  sendButton.addEventListener("click", async () => {
    if (busy) return;
    const address = email.value.trim();
    if (!email.checkValidity() || !address) {
      email.reportValidity();
      report("Enter a valid email address first.", true);
      return;
    }
    const captcha = turnstileValue();
    if (!captcha) {
      report("Please complete the security check, then request your code.", true);
      return;
    }
    setBusy(true);
    report("Sending verification code...", false);
    try {
      const result = await request("/start", { email: address, turnstileToken: captcha });
      challengeId = result.challengeId;
      proofToken = "";
      proofInput.value = "";
      codeBox.hidden = false;
      sendButton.textContent = "Send another code";
      report("Code sent. Check your inbox or spam folder. It expires in 10 minutes.", false);
      resetTurnstile(); // The original lead handler needs a NEW single-use Turnstile token.
      codeInput.focus();
    } catch (error) {
      report(error.message, true);
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  });

  verifyButton.addEventListener("click", async () => {
    if (busy) return;
    if (!challengeId || !/^[0-9]{6}$/.test(codeInput.value.trim())) {
      report("Enter the six-digit code from your email.", true);
      return;
    }
    setBusy(true);
    report("Checking code...", false);
    try {
      const result = await request("/verify", {
        email: email.value.trim(),
        challengeId,
        code: codeInput.value.trim()
      });
      proofToken = result.proofToken;
      proofInput.value = proofToken;
      codeBox.hidden = true;
      sendButton.hidden = true;
      report("Email verified. Complete the security check if needed, then submit your request.", false);
      submit.disabled = false;
    } catch (error) {
      report(error.message, true);
    } finally {
      setBusy(false);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!proofToken) {
      report("Verify your email before submitting.", true);
      return;
    }
    if (!form.reportValidity()) return;
    if (!turnstileValue()) {
      report("Complete the security check before submitting.", true);
      return;
    }
    setBusy(true);
    submit.textContent = "Submitting...";
    report("Submitting your request...", false);
    try {
      const payload = new URLSearchParams(new FormData(form));
      const response = await fetch(endpoint + "/submit", {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Submission failed. Please try again.");
      }
      // Existing thank-you tracking uses the pending sessionStorage flag.
      window.location.assign("/thank-you.html");
    } catch (error) {
      report(error.message, true);
      resetTurnstile();
      submit.textContent = initialSubmitLabel;
      setBusy(false);
    }
  });
})();