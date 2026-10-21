import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleWaitlistSubmit,
  serializeWaitlistForm,
  submitWaitlist
} from '../js/site.mjs';

function makeForm(overrides = {}) {
  const fields = {
    name: { value: '  Ada Author  ' },
    email: { value: '  ADA@EXAMPLE.COM  ', focusCalled: false, focus() { this.focusCalled = true; } },
    genre: { value: 'Fantasy' },
    source: { value: 'updates' },
    website: { value: '' },
    marketingOptIn: { checked: true },
    ...overrides
  };
  const status = { textContent: '', dataset: {} };
  const button = { disabled: false };
  return {
    fields,
    status,
    button,
    resetCount: 0,
    elements: { namedItem(name) { return fields[name] ?? null; } },
    querySelector(selector) {
      if (selector === '[data-form-status]') return status;
      if (selector === 'button[type="submit"]') return button;
      return null;
    },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute(name) { delete this[name]; },
    reset() { this.resetCount += 1; }
  };
}

test('serializes and normalizes waitlist form values including explicit consent', () => {
  const form = makeForm();
  assert.deepEqual(serializeWaitlistForm(form), {
    name: 'Ada Author',
    email: 'ada@example.com',
    genre: 'Fantasy',
    source: 'updates',
    website: '',
    marketingOptIn: true
  });
});

test('unchecked marketing consent is submitted as false', () => {
  const form = makeForm({ marketingOptIn: { checked: false } });
  assert.equal(serializeWaitlistForm(form).marketingOptIn, false);
});

test('posts the waitlist payload as JSON', async () => {
  let request;
  const result = await submitWaitlist({ email: 'ada@example.com' }, async (url, options) => {
    request = { url, options };
    return { ok: true, async json() { return { ok: true, message: "You're on the Italus waitlist." }; } };
  });
  assert.equal(request.url, '/api/waitlist');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.options.body), { email: 'ada@example.com' });
  assert.equal(result.ok, true);
});

test('successful submission resets form and announces success', async () => {
  const form = makeForm();
  await handleWaitlistSubmit(form, async () => ({
    ok: true,
    async json() { return { ok: true, message: "You're on the Italus waitlist." }; }
  }));
  assert.equal(form.resetCount, 1);
  assert.equal(form.status.dataset.state, 'success');
  assert.equal(form.status.textContent, "You're on the Italus waitlist.");
  assert.equal(form.button.disabled, false);
  assert.equal(form['aria-busy'], undefined);
});

test('invalid email focuses the field without sending or resetting', async () => {
  const form = makeForm({ email: { value: 'not-an-email', focusCalled: false, focus() { this.focusCalled = true; } } });
  let called = false;
  await handleWaitlistSubmit(form, async () => { called = true; });
  assert.equal(called, false);
  assert.equal(form.resetCount, 0);
  assert.equal(form.fields.email.focusCalled, true);
  assert.equal(form.status.dataset.state, 'error');
});

test('rate limit response is shown without losing form values', async () => {
  const form = makeForm();
  await handleWaitlistSubmit(form, async () => ({
    ok: false,
    status: 429,
    async json() { return { ok: false, message: 'Please wait before trying again.' }; }
  }));
  assert.equal(form.resetCount, 0);
  assert.equal(form.fields.email.value, '  ADA@EXAMPLE.COM  ');
  assert.equal(form.status.textContent, 'Please wait before trying again.');
  assert.equal(form.status.dataset.state, 'error');
});

test('network failure offers retry and preserves form values', async () => {
  const form = makeForm();
  await handleWaitlistSubmit(form, async () => { throw new Error('network detail'); });
  assert.equal(form.resetCount, 0);
  assert.equal(form.fields.name.value, '  Ada Author  ');
  assert.equal(form.status.textContent, 'We could not connect. Please check your connection and try again.');
  assert.equal(form.status.dataset.state, 'error');
});
