const FORMSPREE_URL = "https://formspree.io/f/xkjwkzrr";

const form = document.getElementById("website-contact-form");
const submitBtn = document.getElementById("contact-submit");
const errorBox = document.getElementById("contact-error");
const successBox = document.getElementById("contact-success");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    errorBox.hidden = true;

    const name = document.getElementById("contact-name").value.trim();
    const business = document.getElementById("contact-business").value.trim();
    const email = document.getElementById("contact-email").value.trim();
    const phone = document.getElementById("contact-phone").value.trim();
    const enquiry = document.getElementById("enquiry-type").value;
    const message = document.getElementById("contact-message").value.trim();

    if (!name || !email || !message) {
      errorBox.textContent = "Please enter your name, email address and message.";
      errorBox.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const payload = new FormData();
      payload.append("name", name);
      payload.append("business", business);
      payload.append("email", email);
      payload.append("phone", phone);
      payload.append("enquiry_type", enquiry);
      payload.append("message", message);
      payload.append("_subject", `TileIQ website enquiry - ${enquiry}`);

      const response = await fetch(FORMSPREE_URL, {
        method: "POST",
        body: payload,
        headers: {
          "Accept": "application/json"
        }
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = result?.errors?.[0]?.message || result?.error || "We couldn’t send your message. Please try again.";
        throw new Error(message);
      }

      form.hidden = true;
      successBox.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });

      if (typeof gtag !== "undefined") {
        gtag("event", "contact_form_submit");
      }
    } catch (error) {
      errorBox.textContent = error.message || "We couldn’t send your message. Please try again.";
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Send message <span>→</span>';
    }
  });
}
