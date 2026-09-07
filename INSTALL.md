# Install and try DraftBack 0.7.1

## Install the ZIP

1. Extract draftback-chromium-0.7.1.zip into a permanent folder.
2. Open chrome://extensions (Chrome), brave://extensions (Brave), or edge://extensions (Edge).
3. Turn on Developer mode, choose Load unpacked, and select the extracted folder containing manifest.json.
4. Pin DraftBack. The practice walkthrough opens automatically.

This is a Chromium development build, not a browser-store installer. Safari's older prototype is not supported by these instructions.

## Try the actual recovery workflow

1. Open https://www.roboform.com/filling-test-all-fields or a non-production application.
2. Open DraftBack in the toolbar. Choose **Protect this site** and approve access.
3. Type fictional details into supported fields: a short name, email, address, written answer, and native dropdown/checkbox choices.
4. Wait until DraftBack says **Saved locally**. No profile and no manual Remember step are required.
5. Reload the same tab.
6. Choose **Restore my answers** in the page prompt or toolbar popup.
7. Check the restored answers. Do not submit a real application as a test.

The guided walkthrough performs the same capture → reload → restore cycle on a safe sample page, with one highlighted action at a time.

## Important boundaries

Enable protection before typing. DraftBack cannot recover text already lost before activation. Access is site-wide, not limited to a single form; stop protection when finished.

Short and long answers and common native controls are supported. Passwords, payment/security details, recognized identity numbers, uploads, legal consent, hidden/disabled/readonly fields and unsupported custom widgets are excluded. Sensitive exclusions depend on field labels/types and are not universal. Complete excluded fields yourself and review all restored answers.

Keep the same tab and exact application URL. New tabs, changed identifiers, cross-origin embedded forms, private windows, PDFs or a lost browser session may not recover. Open an embedded application directly when possible. DraftBack does not restore login sessions or upload files, and never submits a form.

Drafts are encrypted on this device and expire after 24 hours. Saving is asynchronous: a crash before the acknowledgement may lose the last edit. This is not a permanent backup.

## Updating an existing unpacked installation

Keep a separate copy of any important answers before updating. Copy the new package contents into the **same extension folder**, click Reload on the browser's extensions page, then reopen/refresh the application. Do not remove the extension or load a different folder if you need to retain its existing storage.

The 0.7.0 engine does not convert old long-writing records into whole-form snapshots. Those old records remain until expiry or deletion. An extension update cannot recover fields an older version never captured.

## If recovery is unavailable

Check that protection is enabled, the page is ready, and supported controls are detected. If the popup reports a connection error, reload the extension on the browser's extensions page, then reload the form; do not uninstall it. If protection was stopped and restarted, reopen DraftBack and verify its status.

For a new or changed wizard page, enter answers normally; each exact route has its own draft. Return to the earlier route in the same tab to recover its answers. Custom controls or slow conditional sections may need a second Restore click or manual entry.

Use Privacy and settings → Delete site drafts, or Delete all data, to remove temporary data. Optional autofill tools lets you create a reusable profile; it is not needed for recovery.
