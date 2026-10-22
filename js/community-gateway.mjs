import { COMMUNITY_TERMS } from './community-terms.generated.mjs';

async function post(url, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(result.message || 'Unable to continue right now.'); error.status = response.status; error.result = result; throw error; }
  return result;
}
export function startCommunityVerification(data, fetchImpl) { return post('/api/community-access-start', data, fetchImpl); }
export function verifyCommunityCode(data, fetchImpl) { return post('/api/community-access-verify', data, fetchImpl); }
export function requestTrustedCommunityAccess(channel, fetchImpl) { return post('/api/community-access', { channel }, fetchImpl); }

export function initCommunityGateway(root = document) {
  const dialog = root.querySelector('[data-community-dialog]'); if (!dialog) return;
  const terms = dialog.querySelector('[data-community-terms]'); const emailForm = dialog.querySelector('[data-community-email-form]');
  const codeForm = dialog.querySelector('[data-community-code-form]'); const status = dialog.querySelector('[data-community-status]');
  const agreement = codeForm.elements.namedItem('accepted'); const age = codeForm.elements.namedItem('ageConfirmed'); const submit = codeForm.querySelector('button[type="submit"]');
  terms.innerHTML = COMMUNITY_TERMS.html;
  let channel = 'community'; let challengeId = null; let trigger = null;
  const announce = (message, state = '') => { status.textContent = message; status.dataset.state = state; };
  const close = () => { dialog.close(); trigger?.focus(); };
  dialog.querySelector('[data-community-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  const updateAgreement = () => { submit.disabled = !(agreement.checked && age.checked); };
  agreement.addEventListener('change', updateAgreement); age.addEventListener('change', updateAgreement);
  root.querySelectorAll('[data-community-channel]').forEach((button) => button.addEventListener('click', async () => {
    channel = button.dataset.communityChannel; trigger = button; button.disabled = true;
    try { const result = await requestTrustedCommunityAccess(channel); window.location.assign(result.destination); }
    catch (error) { if (error.status === 401) { emailForm.hidden = false; codeForm.hidden = true; challengeId = null; announce(''); dialog.showModal(); emailForm.elements.namedItem('email').focus(); } else announce(error.message, 'error'); }
    finally { button.disabled = false; }
  }));
  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = emailForm.querySelector('button[type="submit"]'); button.disabled = true; announce('Sending your code…');
    try { const result = await startCommunityVerification({ email: emailForm.elements.namedItem('email').value, channel }); challengeId = result.challengeId; emailForm.hidden = true; codeForm.hidden = false; announce(result.message); codeForm.elements.namedItem('code').focus(); }
    catch (error) { announce(error.message, 'error'); } finally { button.disabled = false; }
  });
  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault(); submit.disabled = true; announce('Verifying your code and recording acceptance…');
    try { const result = await verifyCommunityCode({ challengeId, code: codeForm.elements.namedItem('code').value, accepted: agreement.checked, ageConfirmed: age.checked }); announce('Verified. Opening the selected community…', 'success'); window.location.assign(result.destination); }
    catch (error) { announce(error.message, 'error'); updateAgreement(); }
  });
}
if (typeof document !== 'undefined') initCommunityGateway();
