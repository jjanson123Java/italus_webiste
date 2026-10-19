export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

export function getFormConfirmation(type) {
  const messages = {
    waitlist: 'Preview complete. Waitlist delivery will be connected before launch.',
    access: 'Early access request captured in this preview. Delivery is not yet connected.',
    contact: 'Message validated in preview mode. Contact delivery will be connected before launch.'
  };
  return messages[type] || messages.waitlist;
}

export function getCopyrightYear(date = new Date()) {
  return date.getFullYear();
}

function initNavigation() {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    menu.dataset.open = String(!open);
  });
}

function initForms() {
  document.querySelectorAll('[data-preview-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = form.querySelector('input[type="email"]');
      const status = form.querySelector('[data-form-status]');
      if (!email || !status) return;
      if (!isValidEmail(email.value)) {
        status.textContent = 'Enter a valid email address.';
        status.dataset.state = 'error';
        email.focus();
        return;
      }
      status.textContent = getFormConfirmation(form.dataset.previewForm);
      status.dataset.state = 'success';
      form.reset();
    });
  });
}

function initYear() {
  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = String(getCopyrightYear());
  });
}

function initReveals() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((item) => item.dataset.visible = 'true');
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.dataset.visible = 'true';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach((item) => observer.observe(item));
}

if (typeof document !== 'undefined') {
  initNavigation();
  initForms();
  initYear();
  initReveals();
}

