# Release readiness audit

Audit date: 2026-11-14. Project: `F:\smart_csv_cleaner\frontend`.

## Recommendation

**GO for a public, frontend-only beta in the tested browser scope.** No confirmed release-blocking defect remains after the fixes below. This is not a claim of compatibility with every browser, assistive technology, or spreadsheet. Keep the documented file limits, local-session behavior, and formula-export notices visible. Deployment and push were not performed.

A future Vercel release should use this frontend as the project root, `npm run build` as the build command, and `dist` as the static output. The actual hosting configuration, security headers, HTTPS, and any hosting analytics have not been exercised or approved by this local audit. Check those when deployment is authorized; do not enable dataset-capturing analytics/session replay.

## Evidence and final results

| Check | Observed result |
| --- | --- |
| `npm test` | 27 passed: original 13 tests plus 14 audit regressions |
| `npm run lint` | Passed, zero ESLint errors |
| `npm run build` | Passed, Vite production assets generated |
| `npm run test:e2e` | 18 passed against production preview in headless Microsoft Edge on Windows |
| axe WCAG 2 A/AA and 2.1 A/AA rules | No violations in the tested states at 390px and 1440px |
| `npm audit --json` | Zero reported vulnerabilities, including development dependencies |
| `npm audit --omit=dev --json` | Zero reported vulnerabilities for the production dependency scope |
| UTF-8 source check | All inspected frontend text files decoded strictly as UTF-8, with no mojibake signatures |
| Visual review | Inspected generated 320px and 1440px synthetic-data screenshots |

The browser suite covers empty and loaded workspaces, proposals, all missing-value choices, canceled and accepted confirmations, replacement and restoration, actual CSV/JSON downloads, file chooser and drag/drop, malformed/invalid/over-limit inputs, original/current views, pagination, settings, keyboard navigation, formula-protected/raw exports, text-only rendering, console/network privacy, five responsive widths, and a short desktop viewport. The accessibility runs cover empty, uploaded, proposed-fill/error, Reports, Settings, and Data Cleaning states. They do not certify full WCAG compliance.

Test runners and headless browser processes required execution outside the filesystem sandbox. No backend or remote application data service was used. Test data was synthetic. Early failures were addressed and rerun rather than counted as passes: the short-sidebar regression failed before the scroll fix; axe caught contrast and accessible-name problems; a repeated-upload test helper needed to wait for the asynchronous File read/dialog lifecycle before starting another import. The final suite passed without configured retries.

## Confirmed defects fixed

| Finding | Original evidence | Minimal correction and regression |
| --- | --- | --- |
| Formula risk in exported CSV | `toCsv()` quoted fields but emitted formula-like headers/cells unchanged, with no warning | Default-on export mitigation prefixes matching values using Papa Parse escaping. The UI explains text changes, and detected risks require confirmation for both protected and raw modes. Export log events record mode/counts. Unit tests cover dangerous prefixes, controls, full-width variants, quoted delimiter attacks, protected text, raw round-trips, and immutable data; browser tests inspect real downloaded CSV/JSON. |
| Mixed record endings changed cell values | `a,b\nx,1\nx,1\r\n` produced `1` versus `1\r`, defeating exact deduplication | Normalize external CR/LF/CRLF record separators before Papa Parse while preserving quoted CR/LF content. Regression verifies exact duplicate metrics and round-trips of mixed quoted line endings. |
| Malformed unquoted fields accepted | `a,b\nx"y,z` was accepted despite the strict-quoting documentation | Add a small structural validator for quoting and record boundaries; Papa Parse still parses the values. Bare quotes, invalid text after closing quotes, and unclosed fields are rejected with a record number. |
| Fixed sidebar clipped on short desktop screens | Browser regression found its footer entirely outside the viewport at 1280x600 | Make the fixed desktop sidebar scrollable. The failed viewport test now passes. |
| Secondary text contrast below AA | axe measured examples at 4.34:1 on muted badges and 4.48:1 on the workspace background | Slightly darken the shared slate-500 token, preserving layout and color direction. Both final accessibility scenarios pass. |
| Brand link name mismatch | axe reported `label-content-name-mismatch` on the brand link | Remove the overriding aria-label and use the visible brand text as the accessible name. Both final accessibility scenarios pass. |
| No focus assignment after SPA navigation | Navigation changed content and hid the focused mobile navigation button without assigning a destination focus target | Focus the existing, programmatically focusable main landmark after navigation. Keyboard tests verify skip-link, mobile-menu, destination focus, native select, checkbox Space, file-picker Enter, and cleaning confirmation behavior. |

File reading/validation and JSON log construction were extracted into testable helpers. Their behavior is shared by the app and the regression suite; no runtime dependency was added. Early row/column checks also prevent building unnecessarily large parse results before rejecting them.

## Data integrity and log review

- `parseCsv()` returns arrays of strings and row objects, retaining duplicate headers without object-key collisions. It does not infer numbers or dates. UTF-8 BOMs, quoted commas, escaped quotes, multiline values, CRLF, blank records, leading zeros, empty strings, and non-Latin text were tested.
- `buildProposal()` constructs new column/row/value arrays. Original and current data share an initial import object, but none of the cleaning paths writes into that object. The regression suite recursively freezes original data and exercises every cleaning/missing-value strategy successfully. Browser tests also verify original/current behavior after applying and restoring changes.
- Missing defaults to keep. Fill requires explicit nonblank text; remove targets entire rows with any missing cell. Trimming preserves interior whitespace. Deduplication compares exact complete row arrays after preceding selected changes and keeps the first surviving row. Header normalization generates unique names even with collisions, punctuation, blank headers, and Unicode names.
- Every application confirms its counts. Replace-import and restore require confirmation. The tested cancel paths and invalid imports leave working data intact. Pending selections only affect the proposed preview and are not exported as applied changes.
- CSV serialization quotes all fields and retains empty final records. Ordinary data and explicitly raw formula-like data round-trip in tests. Protected CSV text deliberately differs only by the documented apostrophe prefixes; working/original data remains unchanged.
- A JSON log replay test starts from a frozen original, verifies each logged before value, applies every change, and reconstructs the exact proposed/applied result. Download tests compare the app's exported event changes/options/summaries and current version with the expected cleaning result. Stable row IDs refer to source data records, not physical CSV lines.

## Limits verified

| Limit | Boundary tests |
| --- | --- |
| 5 MB UI label | Exactly `5 * 1024 * 1024` bytes accepted; one byte above rejected before reading file bytes |
| 25,000 data rows | Boundary accepted, next row rejected; header excluded and final terminator handled |
| 200 columns | Header-only boundary accepted; column 201 rejected |
| 250,000 data cells | Boundary accepted including empty cells; next full row beyond the limit rejected |

Production-browser tests also submit over-limit files for all four constraints and verify the existing workspace survives. All constraints remain enforced together. They were not increased or bypassed.

## Privacy and security observations

Source review found no application `fetch`, XMLHttpRequest, axios, sendBeacon, console logging, remote analytics, HTML injection, or browser-persistence calls. A production-browser test uploads an identifying synthetic marker and HTML-like payload, then exercises rendering and JSON export. It observes no CSV-bearing network requests, no non-GET or remote requests during the workflow, no marker in console output, no executed payload, and no page errors. Initial static page/asset requests are expected and are not CSV uploads.

The session activity log and deliberately downloaded JSON contain sensitive filenames and CSV before/after values. They are local application records, not anonymous telemetry; the README explicitly explains their sensitivity. No source file on disk is written. Blob URLs are revoked after requesting downloads.

Both dependency audits reported zero known vulnerabilities for the installed lockfile at audit time. Production dependencies were not upgraded. Added QA dependencies are `@playwright/test` and `@axe-core/playwright` in devDependencies only. An advisory scan is not proof of security and should be rerun before release.

## Remaining limitations

- Formula prefixing is risk reduction, not universal spreadsheet safety. A raw export can contain active formulas after explicit warning/confirmation. Protected files can retain visible apostrophes in programmatic imports; spreadsheet save/reopen behavior varies. No spreadsheet application was launched or used to execute formulas. See [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection) and [Papa Parse export options](https://www.papaparse.com/docs).
- Real browser coverage is Windows Edge only, including mobile-sized viewports. Firefox, Safari, real mobile hardware, manual screen-reader operation, and broader zoom/device testing remain unverified.
- Computation and log serialization run on the main thread and in memory. File limits do not guarantee latency or memory behavior on every device. Very large individual cells, large fill strings, growing history, and serialization can consume substantial resources. No low-memory-device performance claim is made.
- Export size is not capped; filling and quoting can produce CSV larger than the import limit. Exported logs can also be large. There is no persistence, undo history beyond restore-original, autosave, or unload warning. Reload/close/replacement can lose the current session as documented.
- Only UTF-8 comma-delimited CSV with at least one named header is supported. Strict quoting rejects permissive dialects such as spaces after a closing quote. Decomposed Unicode normalization/transliteration is not promised by header standardization.
- Vercel runtime hosting behavior/security headers were not tested because deployment was explicitly excluded. No backend, storage, authentication, database, push, or deployment was added.

## Source files modified or added

- `src/lib/csv.js`: strict structural preparation, mixed-ending handling, centralized file validation/reading, formula mitigation/counts, and JSON log helper.
- `src/App.jsx`: shared import/log helpers, explicit export-protection confirmations and audit metadata, navigation focus.
- `src/components/ExportPanel.jsx`: disclosed formula-risk option and count.
- `src/components/Sidebar.jsx`: short-screen scrolling and accessible brand link name.
- `src/index.css`: contrast correction for secondary text.
- `tests/audit.test.js`: 14 added unit regressions.
- `tests/e2e/workspace.spec.js`: 18 production-browser checks.
- `playwright.config.js`: local production preview, headless Edge, no traces/videos or automatic sensitive-data screenshots.
- `package.json`, `package-lock.json`: QA-only dependencies and test commands.
- `.gitignore`: exclude browser-test artifacts.
- `README.md`: accurate setup, functionality, limits, formula behavior, privacy, and test instructions.
- `RELEASE_AUDIT.md`: this evidence-based audit.

Ignored build outputs and synthetic browser artifacts were regenerated locally. No files outside the frontend project were intentionally modified.
