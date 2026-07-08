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
  const availabilityStatus = document.querySelector("[data-availability-status]");
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
  const successStage = document.querySelector("[data-booking-success]");
  const successTitle = document.querySelector("[data-booking-success-title]");
  const successCopy = document.querySelector("[data-booking-success-copy]");
  const bookAgainButton = document.querySelector("[data-book-again]");
  const defaultButtonText = submitButton?.innerHTML;
  const consultationMinutes = 30;
  const availabilityCache = new Map();
  const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  const longDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const slotTimes = buildSlotTimes();
  let selectedDay;
  let selectedSlot;
  let availabilityRequestId = 0;

  function buildSlotTimes() {
    const slots = [];
    const sample = new Date();

    for (let hour = 7; hour <= 23; hour += 1) {
      const minutes = hour === 23 ? [0] : [0, 30];

      minutes.forEach((minute) => {
        sample.setHours(hour, minute, 0, 0);
        slots.push({
          id: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
          label: timeFormatter.format(sample),
          hour,
          minute,
        });
      });
    }

    return slots;
  }

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

  function getDayKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function getSlotRange(day, slot) {
    const start = new Date(day);
    start.setHours(slot.hour, slot.minute, 0, 0);
    const end = new Date(start.getTime() + consultationMinutes * 60 * 1000);
    return { start, end };
  }

  function rangesOverlap(start, end, busyRanges) {
    return busyRanges.some((range) => {
      const busyStart = new Date(range.start);
      const busyEnd = new Date(range.end);
      return start < busyEnd && end > busyStart;
    });
  }

  function setAvailabilityText(message) {
    if (availabilityStatus) {
      availabilityStatus.textContent = message;
    }
  }

  function showBookingForm() {
    bookingForm.hidden = false;
    bookingForm.classList.remove("is-confirmed");
    successStage?.setAttribute("hidden", "");
    successStage?.classList.remove("is-replaying");
  }

  function showBookingSuccess({ inviteSent = true } = {}) {
    if (successTitle) {
      successTitle.textContent = inviteSent ? "Calendar event booked." : "Booking request received.";
    }

    if (successCopy) {
      successCopy.textContent = inviteSent
        ? "Your calendar invite has been sent. We’ll see you on the call."
        : "We received the request and will confirm the calendar invite shortly.";
    }

    if (status) {
      status.className = "form-status";
      status.textContent = "";
    }

    bookingForm.classList.add("is-confirmed");
    successStage?.removeAttribute("hidden");
    successStage?.classList.remove("is-replaying");
    void successStage?.offsetWidth;
    successStage?.classList.add("is-replaying");
  }

  function renderSlots({ loading = false } = {}) {
    if (!slotContainer || !selectedDay) return;

    const dayKey = getDayKey(selectedDay);
    const busyRanges = availabilityCache.get(dayKey) || [];

    slotContainer.innerHTML = "";
    slotContainer.classList.toggle("is-loading", loading);

    if (selectedSlot && !loading) {
      const selectedRange = getSlotRange(selectedDay, selectedSlot);
      const selectedIsBooked = rangesOverlap(selectedRange.start, selectedRange.end, busyRanges);
      if (selectedIsBooked) {
        selectedSlot = undefined;
        updateSummary();
      }
    }

    slotTimes.forEach((slot) => {
      const { start, end } = getSlotRange(selectedDay, slot);
      const isBooked = !loading && rangesOverlap(start, end, busyRanges);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-slot";
      button.disabled = loading || isBooked;
      button.setAttribute("aria-pressed", selectedSlot?.id === slot.id ? "true" : "false");
      button.classList.toggle("is-selected", selectedSlot?.id === slot.id && !isBooked);
      button.classList.toggle("is-booked", isBooked);
      button.innerHTML = `<span>${slot.label}</span><small>${loading ? "Checking..." : isBooked ? "Booked" : "Available"}</small>`;
      button.addEventListener("click", () => {
        if (isBooked || loading) return;
        selectedSlot = slot;
        slotContainer.querySelectorAll(".booking-slot").forEach((item) => {
          item.classList.remove("is-selected");
          item.setAttribute("aria-pressed", "false");
        });
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
        updateSummary();
      });
      slotContainer.append(button);
    });
  }

  async function loadAvailabilityForDay(date) {
    const dayKey = getDayKey(date);
    const requestId = (availabilityRequestId += 1);

    if (availabilityCache.has(dayKey)) {
      renderSlots();
      setAvailabilityText("Times are shown in your timezone. Booked times are automatically blocked.");
      return;
    }

    if (window.location.protocol === "file:") {
      availabilityCache.set(dayKey, []);
      renderSlots();
      setAvailabilityText("Live availability appears on the published site. Booked times are blocked there.");
      return;
    }

    const rangeStart = new Date(date);
    rangeStart.setHours(7, 0, 0, 0);
    const rangeEnd = new Date(date);
    rangeEnd.setHours(23, 30, 0, 0);

    renderSlots({ loading: true });
    setAvailabilityText("Checking the latest available times...");

    try {
      const response = await fetch(
        `/api/booking-availability?start=${encodeURIComponent(rangeStart.toISOString())}&end=${encodeURIComponent(rangeEnd.toISOString())}`,
        { headers: { Accept: "application/json" } },
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.ok === false) {
        throw new Error(result.message || "Availability could not be loaded.");
      }

      availabilityCache.set(dayKey, Array.isArray(result.busy) ? result.busy : []);

      if (requestId === availabilityRequestId) {
        renderSlots();
        setAvailabilityText("Times are shown in your timezone. Booked times are automatically blocked.");
      }
    } catch (_) {
      availabilityCache.set(dayKey, []);

      if (requestId === availabilityRequestId) {
        renderSlots();
        setAvailabilityText("Live availability could not load. We’ll verify your selected time before confirming.");
      }
    }
  }

  function renderDays() {
    if (!dayContainer) return;

    dayContainer.innerHTML = "";
    getUpcomingBusinessDays(7).forEach((date, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-day";
      button.innerHTML = `<b>${date.getDate()}</b><span><strong>${dateFormatter.format(date)}</strong><span>${index === 0 ? "Next opening" : "Open slots"}</span></span>`;
      button.addEventListener("click", () => {
        selectedDay = date;
        selectedSlot = undefined;
        dayContainer.querySelectorAll(".booking-day").forEach((item) => item.classList.remove("is-selected"));
        button.classList.add("is-selected");
        updateSummary();
        loadAvailabilityForDay(date);
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
      if (window.location.protocol === "file:") {
        throw new Error("local-file-preview");
      }

      const response = await fetch("/api/book-consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 409) {
        status.className = "form-status is-error";
        status.textContent = result.message || "That slot is no longer available. Please choose another time.";
        availabilityCache.delete(getDayKey(selectedDay));
        await loadAvailabilityForDay(selectedDay);
        return;
      }

      if (!response.ok) {
        const detail = result.detail ? ` (${result.detail})` : "";
        throw new Error(`${result.message || "Calendar booking could not be completed."}${detail}`);
      }

      bookingForm.querySelectorAll('input[type="text"], input[type="email"], textarea').forEach((field) => {
        field.value = "";
      });

      showBookingSuccess({ inviteSent: result.inviteSent !== false });

      availabilityCache.delete(getDayKey(selectedDay));
      selectedSlot = undefined;
      updateSummary();
      await loadAvailabilityForDay(selectedDay);
    } catch (error) {
      status.className = "form-status is-error";
      if (error.message === "local-file-preview") {
        status.textContent = "Calendar booking only works on the live Cloudflare site, not the local file preview. Test this on axler8-site.pages.dev.";
      } else {
        status.textContent = error.message || "Calendar booking could not be completed. Please try again.";
      }
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = defaultButtonText || "Confirm booking";
    }
  });

  updateService("CRM automation");
  renderDays();

  bookAgainButton?.addEventListener("click", () => {
    showBookingForm();
    selectedSlot = undefined;
    updateSummary();
    renderSlots();
    if (status) {
      status.className = "form-status";
      status.textContent = "";
    }
    bookingForm.querySelector("input[name='Name']")?.focus();
  });
}
