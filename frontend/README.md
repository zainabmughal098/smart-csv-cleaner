# Smart CSV Cleaner

A frontend-only, browser-local CSV cleaning workspace built with React, Vite, Tailwind CSS v4, Lucide, and Papa Parse. No backend, account, database, cloud storage, or deployment is included.

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
- Original upload and current applied data are separate views. Cleaning selections create a proposal only. The comparison shows impact metrics and the first eight proposed steps, with exact before/after values in execution order. Later steps may use earlier proposed values.
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
| File size | 5 x 1024 x 1024 bytes (5 MiB; UI label: 5 MB) |
| Data rows | 25,000; header excluded |
| Columns | 200, including empty/duplicate headers |
| Data cells | 250,000 = data rows x header columns, including missing cells |

An oversized file is rejected before its bytes are read. Structural validation rejects excess record/column counts early; parsed shape and total cells are checked before import. Keep the header and fewer complete records in a separate UTF-8 sample to reduce file size, while respecting every structural limit. Never split by physical lines because a quoted value may span multiple lines.

Processing is in memory on the main browser thread. There is no streaming, worker, compression, or large-file service. Limits are safety bounds, not a responsiveness guarantee on all hardware. Very large cells, long replacement values, repeated cleaning sessions, and growing change logs can still increase CPU/memory use. Filling values and CSV quoting may produce an export larger than the import limit; export size is not capped, so such a download may require a smaller sample to re-import.

## Privacy and session lifetime

The application does not send CSVs, cells, filenames, or change logs to a server and does not write them to the browser console. No analytics, tracking SDK, third-party fonts, or external data services are integrated. React renders CSV strings as text, not executable HTML. Browser downloads use local Blob URLs which are revoked after requesting the download.

All session data and preferences stay in React memory; there is no localStorage, IndexedDB, service worker, or recovery persistence. Original data is not mutated by cleaning or serialization, and the source file on disk is never written. Reloading/closing the page loses the workspace. Replacing an import clears the previous session history after confirmation. Export before leaving or replacing a file. There is no unload warning or autosave.

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

## Publish the repository to GitHub (instructions only)

The intended repository root is `F:\smart_csv_cleaner`, containing `frontend/`. As inspected during publication preparation, Git has not been initialized and there is no project remote or existing commit history. The current global author email lacks an `@`; configure a valid repository-local verified email or the exact GitHub-provided noreply address before committing. Do not infer your email from your username. GitHub CLI is not required.

First create an **empty** public repository named **smart-csv-cleaner** on GitHub. Do not generate a README, license, or `.gitignore` there. Replace the three identity/account placeholders below. These are commands to run later, not commands already executed by this preparation:

```powershell
cd F:\smart_csv_cleaner
git init -b main
git config --local user.name "YOUR_NAME"
git config --local user.email "YOUR_VERIFIED_EMAIL_OR_GITHUB_NOREPLY_ADDRESS"
git config --local --get user.name
git config --local --get user.email
git add --dry-run -- frontend
git add -- frontend
git status --short
git diff --cached --stat
git diff --cached --check
git diff --cached
git commit -m "Prepare Smart CSV Cleaner frontend for public beta"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/smart-csv-cleaner.git
git remote -v
```

Inspect the staged diff before committing. The actual application, package lockfile, QA source/configuration, documentation, favicon, and the synthetic fixture belong in Git. `frontend/.gitignore` excludes dependency/build directories, browser artifacts, caches, temporary files, Vercel local state, environment files, credential files, uploaded CSVs, and exported change logs. Only `tests/fixtures/edge-cases.csv` is allowlisted as a CSV; never use force-add on private datasets or secrets. New files must be reviewed again before staging. No secrets are needed, and Vite-exposed environment variables must never contain secrets.

When you choose to publish, authenticate using Git's credential manager/browser prompt and then run this **separate publishing step**:

```powershell
git push -u origin main
```

If `origin` or a Git repository already exists when you reach these steps, inspect it before adapting the initialization commands; do not overwrite it blindly. The frontend README is under `frontend/`; a repository-root landing README can be added separately if desired. No project license was selected during preparation.

See [GitHub's existing-code instructions](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## Deploy to Vercel (instructions only)

**Hosting has not been tested and no deployment has been performed.** The local production build is static Vite output; compatibility here is based on inspected source/build output and the documented Vercel settings, not a successful hosted build.

After publishing the repository when authorized:

1. In Vercel, choose **Add New > Project**, connect GitHub, and import `smart-csv-cleaner`.
2. Set the following options before clicking Deploy:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | `frontend` when the Git repository root is `smart_csv_cleaner` / `smart-csv-cleaner` |
| Install command | `npm ci --include=dev` (Vite and the React plugin are build-time development dependencies) |
| Build command | `npm run build` |
| Output directory | `dist` (relative to `frontend`, **not** `frontend/dist`) |
| Node.js version | 24.x, matching `engines.node` |
| Production branch | `main` |
| Environment variables/secrets | None |

3. Do not add a backend, storage integration, database, or runtime API. Do not omit build-time development dependencies; Vite and the React plugin are required by the build. Browser tests are a separate local/CI check and are not part of `npm run build`.
4. When ready, click **Deploy**. Review the hosted build/install logs and the actual deployment URL. This action is intentionally not performed during preparation.
5. On the eventual deployment, verify initial load/refresh, static assets and favicon, navigation, the synthetic fixture metrics, confirmations, CSV/JSON downloads, narrow layouts, and browser console/network behavior. Review hosting headers, access settings, and any platform analytics. Do not enable tools that capture dataset contents.

The interface has no pathname router, React Router, or History API routes. Dashboard, Data Cleaning, Reports, and Settings are React state views at `/`; refresh returns to the initial empty workspace. `#main-content` is an in-page accessibility anchor. **No Vercel rewrite is necessary, and no `vercel.json` was added.** If real path-based routes are introduced later, reassess direct-link/refresh behavior and the SPA fallback then.

If instead you publish only the frontend contents at the repository root, leave Vercel's Root Directory at its default (`.`) and keep `dist` as the output. Do not select `frontend` for that alternative layout.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [build/root directory settings](https://vercel.com/docs/builds/configure-a-build), and [supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). The local audit remains in [RELEASE_AUDIT.md](./RELEASE_AUDIT.md).
