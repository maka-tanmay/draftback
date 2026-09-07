# Recovery reliability: what is measured

The core metric is **type → saved acknowledgement → actual reload → explicit restore → exact answer comparison**. Historical profile-autofill tests are not evidence of draft recovery.

99% remains a target, not a measured probability. Hand-picked regression cases do not establish reliability across arbitrary websites, languages, browsers, authenticated government stages or application accounts.

## Report separate measures

- Field recovery: exact restored values divided by predeclared eligible edited fields that were lost on reload. A missed field identity is a failure, not a post-hoc exclusion.
- Form-step recovery: every expected eligible field recovered, with no unexpected changes.
- Safety: zero observed forbidden-field saves, wrong-form writes, overwrites of newer answers, cross-tab mixing, or unintended submissions.
- Access and exclusions: report CAPTCHA/login blocks and unsupported custom controls separately. State exactly which fields and stages were compared.

The native-control scope includes short/long text, native dates/times, native selects (including multiple), radio choices, ordinary checkboxes and plain-text editable regions. Labels, unique placeholders, stable identifiers, forms, open shadow roots and same-origin frame identities determine safe matches. Ambiguous/anonymous controls are skipped. Security/payment/identity identifiers, uploads and consent are excluded heuristically; exclusions cannot guarantee all sensitive content is identified.

## Current test method

Run npm test and npm run check. The browser scripts are:

```sh
node scripts/test-recovery.mjs PORT
node scripts/test-recovery-public.mjs PORT
node scripts/test-recovery-lifecycle.mjs PORT --preauthorized
```

Use only an isolated development profile. The test setup uses the shipping runtime files with a test-only manifest preauthorizing the named test hosts. It does not disable the runtime permission, origin, tab, URL or storage checks. It does **not** verify the production native grant/deny prompt. The shipped ZIP has no required host permissions.

The fixture suite covers actual reloads, all supported native types, placeholders/visual labels, conditional sections, open shadow roots, same-origin frames, re-rendering, controlled input events, newer edits, cleared answers, sensitive/custom exclusions, ambiguity, tab and SPA route isolation, website rejection, encryption and stopping protection. Unit tests separately cover revoked permission, incognito, frame/origin restrictions, invalid/oversized payloads and deletion-scope invalidation.

Public tests use fictional values and never submit forms or solve CAPTCHAs. A successful public-page row covers only its listed fields on the accessible step, not the entire application. See [PUBLIC-TESTING.md](PUBLIC-TESTING.md) for the release verification summary. Browser scripts write local reports under tests/browser-results/recovery/; those generated reports are not shipped.

## Before advertising a percentage

Use a substantially larger held-out sample chosen independently of implementation, across form families, countries, languages and browsers. Freeze eligibility and expected answers first. Report sample selection, field/form rates, exclusions, blocked stages and statistical uncertainty. Repeat after browser/component changes.

Crash-before-acknowledgement, lost sessionStorage, changed URLs/IDs, closed shadow roots, PDFs, inaccessible frames, custom widgets and authenticated flows remain boundaries. No telemetry or ongoing monitoring is introduced.
