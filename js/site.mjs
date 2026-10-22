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

function formValue(form, name) {
  return form.elements.namedItem(name);
}

export function serializeWaitlistForm(form) {
  const value = (name) => String(formValue(form, name)?.value ?? '').trim();
  return {
    name: value('name'),
    email: value('email').toLowerCase(),
    genre: value('genre'),
    source: value('source'),
    website: value('website'),
    marketingOptIn: Boolean(formValue(form, 'marketingOptIn')?.checked)
  };
}

export async function submitWaitlist(payload, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    const error = new Error('We could not connect. Please check your connection and try again.');
    error.isNetworkError = true;
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || 'Unable to join right now. Please try again.');
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function handleWaitlistSubmit(form, fetchImpl = fetch) {
  const payload = serializeWaitlistForm(form);
  const email = formValue(form, 'email');
  const status = form.querySelector('[data-form-status]');
  const button = form.querySelector('button[type="submit"]');
  if (!email || !status) return;

  if (!isValidEmail(payload.email)) {
    status.textContent = 'Enter a valid email address.';
    status.dataset.state = 'error';
    email.focus();
    return;
  }

  if (button) button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'Joining the waitlist…';
  delete status.dataset.state;

  try {
    const result = await submitWaitlist(payload, fetchImpl);
    status.textContent = result.message || "You're on the Italus waitlist.";
    status.dataset.state = 'success';
    form.reset();
  } catch (error) {
    status.textContent = error.message || 'Unable to join right now. Please try again.';
    status.dataset.state = 'error';
  } finally {
    if (button) button.disabled = false;
    form.removeAttribute('aria-busy');
  }
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

function initRegistrationPlaceholder() {
  const menu = document.querySelector('[data-menu]');
  if (!menu || menu.querySelector('[data-registration-placeholder]')) return;
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button registration-placeholder';
  button.dataset.registrationPlaceholder = '';
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  button.textContent = 'Sign Up — Coming at launch';
  item.append(button);
  menu.append(item);
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

function initWaitlistForms() {
  document.querySelectorAll('[data-waitlist-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleWaitlistSubmit(form);
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
initRegistrationPlaceholder();
  initForms();
  initWaitlistForms();
  initYear();
  initReveals();
}

