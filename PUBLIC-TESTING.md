# DraftBack 0.7.1 verification

Verified on 2026-09-07. This is bounded regression evidence, not a claim that every website works.

- 42 unit tests passed, covering matching, storage, activation and popup behavior.
- 19 browser form/privacy regressions passed.
- 7 browser lifecycle checks passed, including startup with the popup closed, real reloads and explicit restoration.
- 7 shipping-package checks passed.
- Installed Comet, RoboForm all-fields page: the in-page Restore button recovered 3 acknowledged fictional answers after a reload. A second test recovered 5 fictional answers through the toolbar popup, with 0 remaining. No form was submitted.

Browser fixture tests used a runtime-identical copy with named test hosts preauthorized. The installed Comet test used an existing website grant. A fresh native permission grant/deny prompt was not verified by these tests.

The earlier 8-page, 33-answer public matrix belongs to version 0.7.0 and is not presented as new 0.7.1 coverage. Authenticated government workflows, every form stage and arbitrary custom widgets have not been comprehensively tested. No 99% success rate has been established.

## Repeat locally

Run `npm test` and `npm run check` with a recent Node.js version. Follow [INSTALL.md](INSTALL.md) for the unpacked extension and manual fictional-data reload test. Browser automation scripts require an isolated debugging-enabled development browser; never point them at a personal browsing profile. Their `PORT` argument is that browser's debugging port. See [RELIABILITY.md](RELIABILITY.md) for measurement boundaries.

## Release archive

- File: `draftback-chromium-0.7.1.zip`
- Size: 81,477 bytes
- SHA-256: `f3a124ef608154595e23d9906c439952b82a1674f30ae6193769fc20f73710e1`

Supported answers must have reached **Saved locally** before the reload. Restore explicitly, then review. Passwords, identity/payment fields, uploads and consent are outside the intended scope; sensitive-field exclusions are heuristic.
