const root = document.documentElement;
const themeButtons = document.querySelectorAll(".theme-toggle");
const menuButton = document.querySelector(".menu-button");
const mobileMenu = document.querySelector(".mobile-menu");

function applyTheme(theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem("axler8-theme", theme);
  } catch (_) {}

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#07080b" : "#f7f7f4");

  themeButtons.forEach((button) => {
    const isDark = theme === "dark";
    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
  });
}

applyTheme(root.dataset.theme || "dark");

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });
});

function closeMenu() {
  mobileMenu?.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-open");
}

menuButton?.addEventListener("click", () => {
  const willOpen = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(willOpen));
  mobileMenu?.classList.toggle("is-open", willOpen);
  document.body.classList.toggle("menu-open", willOpen);
});

mobileMenu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: "0px 0px -40px" },
);

document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

document.querySelectorAll(".system-card").forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--y", `${event.clientY - rect.top}px`);
  });
});

document.querySelectorAll("[data-contact-form]").forEach((form) => {
  const status = form.querySelector(".form-status");
  const submitButton = form.querySelector('button[type="submit"]');
  const defaultButtonText = submitButton?.innerHTML;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!status || !submitButton) return;

    status.className = "form-status";
    status.textContent = "Sending your inquiry...";
    submitButton.disabled = true;
    submitButton.innerHTML = "Sending...";

    try {
      const response = await fetch("https://formsubmit.co/ajax/cjgomba1003@gmail.com", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });

      if (!response.ok) {
        throw new Error("Form submission failed");
      }

      form.reset();
      status.classList.add("is-success");
      status.textContent = "Sent. We’ll get back to you soon.";
    } catch (_) {
      status.textContent = "Opening secure form submission...";
      HTMLFormElement.prototype.submit.call(form);
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = defaultButtonText || 'Send inquiry <span>→</span>';
    }
  });
});

const bookingForm = document.querySelector("[data-booking-form]");

if (bookingForm) {
  const dayContainer = document.querySelector("[data-booking-days]");
  const slotContainer = document.querySelector("[data-booking-slots]");
  const serviceCards = document.querySelectorAll(".booking-service");
  const serviceInputs = document.querySelectorAll('input[name="serviceChoice"]');
  const serviceSummary = document.querySelector("[data-booking-summary-service]");
  const daySummary = document.querySelector("[data-booking-summary-day]");
  const timeSummary = document.querySelector("[data-booking-summary-time]");
  const serviceField = document.querySelector("[data-booking-service-field]");
  const dayField = document.querySelector("[data-booking-day-field]");
  const timeField = document.querySelector("[data-booking-time-field]");
  const startField = document.querySelector("[data-booking-start-field]");
  const status = bookingForm.querySelector(".form-status");
  const submitButton = bookingForm.querySelector('button[type="submit"]');
  const defaultButtonText = submitButton?.innerHTML;
  const slotTimes = [
    { label: "9:00 AM", hour: 9, minute: 0 },
    { label: "10:30 AM", hour: 10, minute: 30 },
    { label: "1:00 PM", hour: 13, minute: 0 },
    { label: "3:30 PM", hour: 15, minute: 30 },
  ];
  const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  const longDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
  let selectedDay;
  let selectedSlot;

  function getUpcomingBusinessDays(count) {
    const days = [];
    const date = new Date();
    date.setDate(date.getDate() + 1);

    while (days.length < count) {
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        days.push(new Date(date));
      }
      date.setDate(date.getDate() + 1);
    }

    return days;
  }

  function updateService(value) {
    serviceCards.forEach((card) => {
      const input = card.querySelector("input");
      card.classList.toggle("is-selected", input?.value === value);
    });

    if (serviceSummary) serviceSummary.textContent = value;
    if (serviceField) serviceField.value = value;
  }

  function updateSummary() {
    if (daySummary) daySummary.textContent = selectedDay ? longDateFormatter.format(selectedDay) : "Select a day";
    if (timeSummary) timeSummary.textContent = selectedSlot ? selectedSlot.label : "Select a time";
    if (dayField) dayField.value = selectedDay ? longDateFormatter.format(selectedDay) : "";
    if (timeField) timeField.value = selectedSlot ? selectedSlot.label : "";
    if (startField && selectedDay && selectedSlot) {
      const start = new Date(selectedDay);
      start.setHours(selectedSlot.hour, selectedSlot.minute, 0, 0);
      startField.value = start.toISOString();
    }
  }

  function renderSlots() {
    if (!slotContainer || !selectedDay) return;

    slotContainer.innerHTML = "";
    slotTimes.forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-slot";
      button.textContent = slot.label;
      button.addEventListener("click", () => {
        selectedSlot = slot;
        slotContainer.querySelectorAll(".booking-slot").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        updateSummary();
      });
      slotContainer.append(button);
    });
  }

  function renderDays() {
    if (!dayContainer) return;

    dayContainer.innerHTML = "";
    getUpcomingBusinessDays(7).forEach((date, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-day";
      button.innerHTML = `<b>${date.getDate()}</b><span><strong>${dateFormatter.format(date)}</strong><span>${index === 0 ? "Soonest available" : "Open consultation day"}</span></span>`;
      button.addEventListener("click", () => {
        selectedDay = date;
        selectedSlot = undefined;
        dayContainer.querySelectorAll(".booking-day").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        renderSlots();
        updateSummary();
      });
      dayContainer.append(button);

      if (index === 0) {
        button.click();
      }
    });
  }

  serviceInputs.forEach((input) => {
    input.addEventListener("change", () => updateService(input.value));
  });

  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!status || !submitButton) return;

    if (!selectedDay || !selectedSlot) {
      status.className = "form-status is-error";
      status.textContent = "Please choose a day and time first.";
      return;
    }

    const formData = new FormData(bookingForm);
    const payload = Object.fromEntries(formData.entries());

    status.className = "form-status";
    status.textContent = "Checking the booking request...";
    submitButton.disabled = true;
    submitButton.innerHTML = "Reserving...";

    try {
      const response = await fetch("/api/book-consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        status.className = "form-status is-error";
        status.textContent = "That slot is no longer available. Please choose another time.";
        return;
      }

      if (!response.ok) {
        throw new Error("Calendar backend is not ready");
      }

      bookingForm.reset();
      updateService("CRM automation");
      selectedSlot = undefined;
      renderDays();
      status.className = "form-status is-success";
      status.textContent = "Booked. A calendar invitation will be sent shortly.";
    } catch (_) {
      status.textContent = "Calendar sync is being prepared. Sending the request by email instead...";
      HTMLFormElement.prototype.submit.call(bookingForm);
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = defaultButtonText || "Confirm booking";
    }
  });

  updateService("CRM automation");
  renderDays();
}
