const TILEIQ_WORKER_URL = "https://damp-bread-e0f9.kevin-woodley.workers.dev";

const form = document.getElementById("website-contact-form");
const submitBtn = document.getElementById("contact-submit");
const errorBox = document.getElementById("contact-error");
const successBox = document.getElementById("contact-success");

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

  const formattedMessage =
`Website enquiry: ${enquiry}
Business: ${business || "Not supplied"}
Phone: ${phone || "Not supplied"}

${message}`;

  try {
    const response = await fetch(TILEIQ_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "contact_form",
        name: business ? `${name} — ${business}` : name,
        email,
        message: formattedMessage
      })
    });

    if (!response.ok) throw new Error(`Server error ${response.status}`);

    form.hidden = true;
    successBox.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    errorBox.textContent = "We couldn’t send your message. Please try again.";
    errorBox.hidden = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Send message <span>→</span>';
  }
});
