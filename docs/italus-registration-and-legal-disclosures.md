# Italus Registration and Legal Disclosures

**Version:** 1.0  
**Effective date:** Reserved for public application launch  
**Status:** Pre-launch development and legal-review copy

## 1. Registration and eligibility

Italus is an author-directed writing and narrative-development service. You must be at least 18 years old and must control the email address used to register. At launch, Italus will send a short-lived one-time code to that address before creating an account.

Registration creates an Italus account only. Registration does not enroll you in marketing or subscribe you to *Writer's Block*. Registration does not grant community access. Newsletter consent and acceptance of the Italus Community Gateway, Rules, and Third-Party Disclosure are separate, optional actions with separate evidence records.

You are responsible for accurate account information, safeguarding your email account and sessions, and promptly reporting suspected unauthorized use. You may not create an account for another person, impersonate another person, evade a suspension, or use Italus for unlawful activity.

## 2. Pre-launch availability and future plans

The application is not yet open for registration. The public Sign Up control remains disabled until Italus intentionally enables registration and completes operational and legal launch review.

Initial application access is planned to be free. Italus may later offer **Free Trial, Author, and Studio plans**, but there is no automatic conversion to a paid plan. A future paid plan will require advance disclosure of then-current price, billing interval, included features and limits, renewal and cancellation terms, and an explicit plan selection and payment authorization. Continued use of a Free Trial or other free access alone is not consent to future charges.

## 3. Author content and acceptable use

You retain ownership of original manuscripts, canon, characters, research, prompts, rules, and other content you submit, subject to rights held by others. You grant Italus only the permissions reasonably necessary to store, process, display, transmit, back up, and secure that content to provide the service and actions you request.

You must have the right to submit and process your content. You may not use Italus to infringe intellectual-property, privacy, publicity, contractual, or other rights; distribute malware; gain unauthorized access; facilitate fraud; exploit minors; threaten or harass; or generate or distribute unlawful material. Italus may restrict access, preserve relevant evidence, or report conduct where reasonably necessary for safety, security, legal compliance, or enforcement.

Italus tools assist an author but do not make editorial, publishing, legal, tax, medical, or financial decisions for the author. You remain responsible for reviewing generated material, verifying facts and rights, and deciding what enters a manuscript or is published.

## 4. Bring-your-own provider credentials

Some future generation features may require an independent account and API credential from a supported model provider such as OpenAI or Anthropic. Unless a specific plan later states otherwise, Italus does not resell or include that third-party model usage. The provider, not Italus, sets its availability, model behavior, context limits, retention practices, safety controls, token accounting, prices, taxes, quotas, and billing terms.

Provider API keys are secrets. They must never be pasted into a public post, client-side field not explicitly designed for credentials, or support message. Before enabling this feature, the production application must disclose whether a credential is stored or used only for the current session, how it is encrypted, which server component can decrypt it, how it can be revoked or deleted, and which provider receives content. This document does not represent that an unimplemented credential-storage method is already available.

## 5. Token usage, estimates, and independent charges

Model usage can include input tokens, output tokens, cached tokens, tools, images, or other provider-metered units. Tokens are not the same as words. The number of tokens depends on the model, language, formatting, instructions, and supplied context. A 10,000-word canon plus a 200-word prompt therefore must not be described as exactly 10,200 tokens.

Large canons, prose rules, chat history, retrieved passages, revisions, and generated output may be sent again in later requests and can increase cost. Any estimate displayed by Italus is informational unless expressly guaranteed in writing. You are responsible for reviewing provider pricing and account settings, using provider spending limits and alerts where available, and paying charges imposed by your provider. Italus does not waive responsibility that cannot lawfully be excluded, but is not responsible for independent provider charges caused by your authorized use, provider price changes, or provider metering outside Italus's control.

## 6. Third-party services and model output

Use of a third-party provider is also governed by that provider's current terms and privacy practices. For example, users should review the current OpenAI Services Agreement and API documentation or the Anthropic Legal Center and provider documentation applicable to their account. Italus cannot guarantee third-party availability, model accuracy, output originality, security, retention, or continued compatibility.

Model output may be incorrect, incomplete, biased, similar to material generated for others, or unsuitable for publication. You must review output and conduct appropriate factual, originality, defamation, privacy, permissions, and intellectual-property checks before use.

## 7. Privacy and records

At activation, the registration flow will record the normalized verified email, verification time, accepted legal-document version and cryptographic hash, acceptance time, request source, and limited security evidence. Plaintext one-time codes will not be stored. Operational challenge and session records will follow defined deletion schedules; acceptance records will be retained for the period stated in the then-current privacy notice and as necessary for disputes or legal duties.

The production privacy notice must identify actual hosting, database, authentication, mail, analytics, model-provider, and payment processors in use; purposes and legal bases where applicable; retention periods; international transfers; user rights; security/contact procedures; and any sale, sharing, advertising, or automated-decision practices. Material changes require an updated version and, where appropriate, renewed acceptance.

## 8. Suspension, termination, and disputes

Italus may suspend or terminate access for material breach, security threats, unlawful activity, payment failure on a future paid plan, repeated abuse, or risk to users or the service. Where reasonably possible, Italus will provide notice and a method to question the decision. Serious security, fraud, safety, or legal issues may require immediate action.

Governing-law, venue, warranty, liability, indemnity, arbitration or class-action provisions, statutory consumer rights, export controls, and formal notice details must be supplied and reviewed by qualified counsel before registration is activated. No placeholder in this review document should be treated as a waiver of rights that cannot lawfully be waived.

## 9. Launch acceptance presented to the author

> I confirm that I am at least 18 years old, control this verified email address, and have read and agree to the Italus Registration and Legal Disclosures, version 1.0. I understand that registration is currently free, does not enroll me in marketing or community access, does not authorize future charges, and that separate third-party provider terms and charges may apply to features I choose to use.

The checkbox must be unchecked by default. The production system must prevent registration until email verification, affirmative acceptance, current-document version/hash validation, and server-side evidence recording all succeed atomically.

## Development and counsel gates

- Replace the reserved effective date and increment the version for the approved launch document.
- Confirm the actual company/legal entity name, physical and electronic notice addresses, governing jurisdiction, and privacy contact.
- Confirm actual API-key custody and deletion behavior before enabling bring-your-own-key features.
- Add final pricing, refunds, renewal, cancellation, taxes, trial, and payment-processor language before any paid plan is offered.
- Obtain qualified legal review of registration terms, privacy notice, intellectual-property language, limitations, consumer rights, retention, and dispute provisions before activation.
