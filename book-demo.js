const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";

const form = document.getElementById("book-demo-form");
const submitBtn = document.getElementById("demo-submit");
const errorBox = document.getElementById("demo-error");
const successBox = document.getElementById("demo-success");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    errorBox.hidden = true;

    const name = document.getElementById("demo-name").value.trim();
    const business = document.getElementById("demo-business").value.trim();
    const email = document.getElementById("demo-email").value.trim();
    const phone = document.getElementById("demo-phone").value.trim();
    const preferredDate = document.getElementById("demo-date").value;
    const preferredTime = document.getElementById("demo-time").value;
    const notes = document.getElementById("demo-notes").value.trim();

    if (!name || !email) {
      errorBox.textContent = "Please enter your name and email address.";
      errorBox.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const response = await fetch(`${WORKER}/book-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, business, email, phone, preferredDate, preferredTime, notes })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "We couldn’t send your request. Please try again.");
      }

      form.hidden = true;
      successBox.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });

      if (typeof gtag !== "undefined") {
        gtag("event", "book_demo_submit");
      }
    } catch (error) {
      errorBox.textContent = error.message || "We couldn’t send your request. Please try again.";
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Request demo <span>→</span>';
    }
  });
}
