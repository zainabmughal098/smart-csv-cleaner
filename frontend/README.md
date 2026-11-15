# Smart CSV Cleaner

A frontend-only, browser-local CSV cleaning workspace built with React, Vite, Tailwind CSS v4, Lucide, and Papa Parse. No backend, account, database, cloud storage, or environment secrets are required.

This working branch, `feature/large-csv-support`, implements a **25 MiB desktop beta profile**. Production `main` and its existing Vercel deployment were not changed by this work; their previous 5 MiB profile remains separate. Read [the architecture audit](./LARGE_CSV_ARCHITECTURE.md) and [measurements and release decision](./LARGE_CSV_RESULTS.md). **50 MiB is experimental and is not accepted by the application.**

## Local development

Use Node.js 24.x with npm. The tested Node major is declared in `package.json` and `.nvmrc`. No environment file, API key, backend, database, or account is needed to build or run this application. In PowerShell:

```powershell
cd F:\smart_csv_cleaner\frontend
npm ci
npm run dev
```

Open Vite's printed Local URL, normally http://localhost:5173/. For the production build:

```powershell
npm run build
npm run preview
```

After cloning the planned GitHub repository, use `cd smart-csv-cleaner/frontend` before the npm commands. Commit `package-lock.json` and use `npm ci` for reproducible installations. `npm run preview` is a local build preview, not a production hosting server.

The package remains `private: true` to prevent accidental npm publication; this does not prevent a public GitHub repository or a Vercel deployment.

## Verification

```powershell
npm test
npm run lint
npm run build
npm run test:e2e
npm audit
```

Unit tests use Node's built-in runner. Browser tests use Playwright against a local production preview on 127.0.0.1:4173 and the installed Microsoft Edge channel. **Build before running browser tests.** Close other processes on port 4173 first. Install Microsoft Edge separately if unavailable, or change the Playwright channel and install its browser using the official Playwright instructions. The browser test configuration never deploys anything. Playwright and axe are development-only dependencies.

Browser tests upload synthetic data, exercise confirmations, downloads, navigation, pagination, and errors, monitor network and console activity, check layouts at 320/390/768/1024/1440 pixels, and run automated WCAG A/AA accessibility rules with axe. Only synthetic screenshots may be written to ignored `test-results/`; traces and videos are disabled. Automated accessibility checks are not a substitute for a manual assistive-technology review.

The manual fixture `tests/fixtures/edge-cases.csv` contains quoted commas, multiline fields, escaped quotes, empty cells, whitespace, leading zeros, and a duplicate. Expected initial metrics: **3 rows, 4 columns, 2 missing cells, 1 exact duplicate**.

## Actual capabilities

- File picker and drag-and-drop read UTF-8 comma-delimited CSV. The first record is the header. UTF-8 BOMs and LF, CRLF, CR, or mixed record endings are supported. Record endings inside quoted values remain unchanged.
- Values stay strings: there is no numeric/date inference, so leading zeros, large numeric identifiers, UTF-8 text, and literal strings such as `null`, `NA`, and `NaN` are preserved.
- Blank records are retained as rows of empty cells. Exactly one terminal line separator does not create a phantom record. Duplicate/empty headers are preserved until explicit standardization. There must be at least one nonblank header.
- Strict quoting requires double quotes around the entire quoted field and doubled quotes inside it. Bare embedded quotes, text/spaces after closing quotes, unclosed quotes, and inconsistent nonblank record widths are rejected with an error. CSV dialects using semicolons, tabs, or non-UTF-8 encodings are not supported.
- Metrics and paginated previews use actual data. Duplicate counts mean repeated exact rows beyond the first, without type coercion or normalization. Missing means empty or whitespace-only; strings such as `NA` are not treated as missing.
- Original upload and current applied data are separate views. Cleaning selections create a proposal only. The comparison shows impact metrics and the first eight proposed steps, with bounded before/after previews in execution order. Complete values remain in the applied JSON log. Later steps may use earlier proposed values.
- Preview strings are limited to 500 UTF-16 code units without splitting surrogate pairs. Table pages contain at most 1,000 data cells, so wide files show fewer rows than the selected page size. These display limits never truncate the underlying data, exported CSV, or complete JSON log. Activity displays the latest 100 event summaries; JSON retains all session events.
- Supported cleaning: trim leading/trailing cell whitespace (preserving interior whitespace); standardize headers to unique lowercase snake_case names with collision suffixes and fallback names; keep missing values, fill them with a chosen nonblank string, or remove rows containing them; keep the first exact duplicate after preceding selected operations.
- Cleaning order: rename headers, trim cells, handle missing values, then deduplicate. Missing handling defaults to **Keep as-is**. Nothing fills or removes data until an explicit selection and confirmation.
- Apply, replace-import, and restore-original operations require confirmation. Cancel leaves the working data intact. Invalid replacement files also preserve the workspace. All cleaning and export controls are disabled before upload and while a file is loading.
- Exports include the current applied CSV and a JSON session log. Pending proposals are excluded. A download request is recorded, not a claim that the user saved a file. CSV exports use quoted fields and CRLF record endings, preserving empty final records and quoted multiline content.
- The JSON log includes options, summaries, stable source row IDs, exact applied before/after changes, version transitions, restore/import events, and CSV export protection settings/counts. Source row IDs are 1-based data-record IDs from the original upload, not physical line numbers. A CSV re-import creates fresh row IDs; IDs are not an extra CSV column.
- Dashboard and Data Cleaning expose the same local workspace, Reports exposes real session history and exports, and Settings changes preview page size. No analytics, API responses, backend actions, or cleaning controls are simulated.

## Formula injection and exports

Quoting a CSV cell does **not** stop spreadsheets from interpreting formulas. Formula-risk reduction is **on by default** and applies to both headers and data cells. It uses Papa Parse's export escaping to prefix matching values with an apostrophe. Detection includes `=`, `+`, `-`, `@`, their full-width variants, leading whitespace/controls before these prefixes, and cells starting with tab, CR, or LF.

The export panel explains that protection changes the **downloaded text only**. A confirmation reports the number of matching values before export. The current dataset, original upload, and applied-cleaning history do not change. For example, a negative numeric string may acquire an apostrophe, and importing a protected CSV programmatically retains that apostrophe. Protected downloads use an `_protected.csv` suffix when values were changed. CSV export events record the mode, risk count, and escaped count.

Turn protection off for an exact raw-value round-trip. Raw export containing detected risks requires a separate warning confirmation. Do not open untrusted raw files in a spreadsheet. There is **no universal CSV sanitization strategy** for all spreadsheet programs or save/reopen workflows; this is risk reduction, not a guarantee. See [Papa Parse export documentation](https://www.papaparse.com/docs) and [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection). Spreadsheet application execution has not been tested as part of the automated audit.

## Limits and resource behavior

All import limits apply together and are inclusive:

| Limit | Enforced value |
| --- | --- |
| File size | 25 x 1024 x 1024 bytes (25 MiB; UI label: 25 MB) |
| Data rows | 100,000; header excluded |
| Columns | 200, including empty/duplicate headers |
| Data cells | 1,000,000 = data rows x header columns, including missing cells |

An oversized file is rejected before its bytes are read. Structural validation rejects excess record/column counts early; parsed shape and total cells are checked before import. Keep the header and fewer complete records in a separate UTF-8 sample to reduce file size, while respecting every structural limit. Never split by physical lines because a quoted value may span multiple lines.

Parsing, metrics, proposals, and serialization run in a dedicated local Web Worker. The file is decoded incrementally in 256 KiB slices and Papa Parse receives complete record batches. React receives bounded pages and summaries, rather than cloned full datasets. Original/current rows share unchanged values; original data is never modified. Export serialization produces bounded pieces but the complete dataset, history, and download Blob still reside in browser memory. This is not disk-backed or unlimited streaming.

Processing reports actual phase/byte/row progress and supports cooperative cancellation before commit/download. One very large record or serialization step can delay cancellation. Confirmation/commit steps cannot be cancelled once committed. A worker failure requires a reload and re-import; there is no synchronous fallback or session recovery.

Additional operation budgets preserve complete logs instead of silently dropping changes:

| Budget | Bound |
| --- | --- |
| Proposed detailed changes | 250,000 entries and 32 MiB serialized detail |
| Retained session history | 64 MiB serialized accounting |
| Proposed dataset text | 33,554,432 UTF-16 code units across headers/cells |
| CSV or JSON export | 128 MiB encoded output |

These are logical budgets, **not a hard browser-memory ceiling**. A valid import can still have an expensive transformation rejected. For example, trimming one nearly 25 MiB field needs almost 50 MiB of exact before/after log text and exceeds the proposal budget. Rejection leaves current/original data intact and drops no log details. Choose fewer operations or a smaller sample; export data and logs before starting a fresh session. Filling/quoting can produce an export larger than the upload limit, which may not be re-importable without a smaller sample.

Local evidence covers exact 5/10/25 MiB files, 100,000-row and 200-column/million-cell shapes, and a separate 50 MiB experiment with a relaxed test-only text budget. Two repetitions on one Windows desktop do not establish mobile/browser-wide support. Workers improve responsiveness, not necessarily processing duration. See the results document for timings and sampled-heap caveats.

## Privacy and session lifetime

The application does not send CSVs, cells, filenames, or change logs to a server and does not write them to the browser console. No analytics, tracking SDK, third-party fonts, or external data services are integrated. React renders CSV strings as text, not executable HTML. Browser downloads use local Blob URLs which are revoked after requesting the download.

Dataset values and complete history stay in worker memory; React holds settings, bounded previews, summaries, and temporary export Blobs. There is no localStorage, IndexedDB, service worker, or recovery persistence. Original data is not mutated by cleaning or serialization, and the source file on disk is never written. Reloading/closing the page loses the workspace. Replacing an import clears the previous session history after confirmation. Export before leaving or replacing a file. There is no unload warning or autosave.

The **explicitly downloaded JSON log contains sensitive CSV values**, source metadata, and before/after values. Treat it like the original dataset. It is not anonymous telemetry. Downloaded files remain wherever the browser/user saves them. Browser extensions, device access, and spreadsheet software are outside this application's privacy boundary. When hosted, ordinary page/asset requests still go to the hosting provider; the app itself does not attach dataset contents.

## Release scope and remaining QA

This is a bounded, frontend-only CSV tool. Automated browser coverage targets desktop/mobile-sized **Microsoft Edge on Windows**, not actual iOS/Android hardware, Safari, Firefox, or every spreadsheet. Manual screen-reader review and broader browser/device/performance testing remain outside the automated checks. The repository contains no deployed Vercel configuration verification; production hosting headers, HTTPS, asset routing, and hosting analytics must be reviewed when deployment is eventually authorized.

A successful npm audit means no vulnerabilities were reported for this lockfile at that time; it is not proof of the absence of security defects. Re-run it before release. Do not add analytics/session-replay tools that capture CSV contents.

## Manual smoke test

1. Check desktop and narrow layouts, keyboard focus, the skip link, navigation, and horizontal table scrolling.
2. Upload `tests/fixtures/edge-cases.csv`; verify the expected metrics above and the multiline cell.
3. Enable trim, standardization, and duplicate removal. Current metrics must remain unchanged while the proposal is shown. Cancel once, then apply; current metrics should become 2 rows and 1 missing cell.
4. Switch original/current views. Fill the missing cell only after entering a value and confirming. Restore after confirmation and verify original values return.
5. Download CSV and JSON. Check log changes, versions, options, and excluded pending proposals. Try a formula-like value and inspect both protected and confirmed raw exports without executing untrusted formulas.
6. Change page size in Settings. Try malformed, invalid UTF-8, and over-limit files; an existing dataset must remain intact.
7. Save required downloads before reloading. Verify that reloading clears the session.

## Reproduce the performance experiment

Run `npm run benchmark` from `frontend/` with Microsoft Edge installed, port 4174 available, and baseline commit `06ebe60` present in local Git history. It reads that commit without changing branches and writes an ignored baseline module under `.tmp/`. No real CSV is used: files are generated synthetically in a worker. The command overwrites `tests/benchmarks/results.json` with environment, shape, timing, correctness and sampled-heap statistics; it stores no CSV values.

The benchmark uses Vite-transformed local modules, two repetitions per case, and a separate benchmark-only 50 MiB profile. It is distinct from the production-build UI tests. Close other heavy applications for comparable runs. Browser memory sampling is incomplete and must not be reported as total process peak memory. See the results document for the method and exact limitations.

## Publication and hosting status

Git is already initialized and this work belongs on `feature/large-csv-support`. Do not reinitialize the repository or replace the existing remote. This task does not stage, commit, push, merge, or deploy. The deployed main branch remains unchanged. Historical initial-publication instructions have been superseded by this status.

If a deployment is separately authorized, the static Vite settings remain: framework **Vite**, root **frontend** when the repository root contains that directory, install **npm ci --include=dev**, build **npm run build**, output **dist**, Node **24.x**, and no environment secrets. There are no pathname routes, so no SPA rewrite is required. A Vite module worker is emitted as a local static asset; its MIME type, loading, CSP and asset routing must be checked on any eventual hosted preview. Existing production hosting was not exercised or changed during this local performance work.

Keep ignored dependencies, dist, temporary files, downloaded logs and private datasets out of Git. Review all new benchmark/QA files before any future commit. Only synthetic fixture data and aggregate benchmark statistics belong in the repository. Do not add dataset-capturing analytics or session replay.

The original [release audit](./RELEASE_AUDIT.md) records the earlier 5 MiB profile; [large-file results](./LARGE_CSV_RESULTS.md) describe this branch's current behavior and beta recommendation.
