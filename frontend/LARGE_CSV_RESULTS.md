# Large-file beta: findings and verification

Date: 2026-11-14. Branch: `feature/large-csv-support`. Baseline: `06ebe60a4a460ecdbf3232af46421dca2d1e6887`.

## Decision

**GO for a bounded 25 MiB desktop beta in the locally tested Edge/Windows scope. NO-GO for advertised 50 MiB support or unrestricted large-file support.** This is a recommendation, not authorization to publish. Nothing was staged, committed, pushed, merged, or deployed. `main` still points to the baseline commit; the existing deployment was not exercised or changed.

The application on this branch accepts at most **26,214,400 bytes, 100,000 data rows, 200 columns, and 1,000,000 data cells**, all limits inclusive and applied together. Production's previous 5 MiB / 25,000 / 200 / 250,000 profile remains separate. These limits do not promise that every possible transformation fits the complete-log budgets below.

## Architecture findings and changes

The [decision record](./LARGE_CSV_ARCHITECTURE.md) was written before implementation. Inspection found whole-file byte/text/normalized-string copies, synchronous parsing and transformation, full original/current/proposed data in React, full-row JSON duplicate keys, repeated metrics/formula scans, and whole-string CSV/JSON serialization. Paginating DOM rows alone did not address these costs.

File bytes are only one bottleneck. Many short rows create object/hash/log overhead; wide data multiplies cell work and DOM size; long values increase hashing/serialization costs; filling cells expands text; repeated transformations retain exact before/after history. A fixed upload-size increase alone would not be safe.

Implemented:

- One dedicated Vite module worker owns original/current/proposed datasets and complete history. React receives descriptors, metrics, bounded pages, event summaries and final Blobs. No complete dataset is cloned into React. Worker failure reports an error requiring reload, rather than falling back to blocking the UI.
- File slices are decoded incrementally in 256 KiB chunks using fatal UTF-8 decoding. A strict quote-aware framer handles complete logical records and mixed external line endings; Papa Parse parses those batches. Embedded quoted newlines survive. This uses a custom worker rather than Papa's `worker: true`, so results remain worker-owned and the existing strict/mixed-ending semantics are preserved. Incomplete giant records still need complete assembly in memory.
- Shared generator-based analysis/cleaning yields cooperatively, with an approximately 8 ms yield target between batches. Metrics and formula risks share a cached analysis pass. Exact duplicate indexing uses hash buckets referencing values, then exact comparisons; deliberately forced collisions are covered by regression tests.
- Cleaning uses copy-on-write rows/values, retaining references for unchanged data. Full original data and source row IDs remain available. No-op proposals reuse the dataset. Pending imports/proposals/exports are transactional; cancelled/failed work cannot replace current data or append an applied event. Version-bound proposal tokens reject stale application.
- The UI debounces proposal work, disables stale application, reports actual byte/row/entry progress, and exposes cancellation before commit/download. A cancelled/rejected preview waits for changed options or explicit recalculation; it does not auto-retry indefinitely. Destructive apply/reset/replace operations retain confirmations.
- Table pages contain at most 1,000 cells and each preview string at most 500 UTF-16 code units, without splitting a surrogate pair. Wide pagination uses the effective capped page size. The first eight proposal details and latest 100 activity summaries are sent to React. Session/workflow identity survives this activity window. Exports retain complete values and history.
- CSV and JSON serialize in pieces inside the worker. Blob downloads and formula protection, warnings, risk counts, raw-export confirmation, and excluded pending proposals remain intact. Export events describe download requests, not successful saves. Cancelled exports create no partial download or success event.

## Resource safety and preserved guarantees

Additional budgets: 250,000 proposal details; 32 MiB serialized proposal detail; 64 MiB serialized session-history accounting; 33,554,432 UTF-16 code units in proposed headers/cells; 128 MiB per encoded export. The remaining history budget is also considered before accepting a proposal. A cheap lower bound rejects an obviously oversized single before/after change before serializing its full JSON copy.

Budgets reject whole operations and explain how to reduce the sample or start a new session. They never truncate exact log details or silently remove/fill rows. Regression evidence includes a maximum-size import whose single trimmed field cannot fit its complete before/after log: proposal rejects and original/current data remain intact. Original preservation and full change logs were not weakened to achieve the headline size.

These serialized/text bounds are not hard process-memory limits: JS objects, temporary strings, hash references, original plus current plus pending replacement, GC, encoded buffers and native Blob storage add overhead. Export uses an in-memory Blob, not disk streaming. Cancellation is cooperative; a single large field/record/serialization or hashing operation can delay acknowledgment. No cancel-time or universal memory guarantee is claimed.

Privacy is unchanged: no CSV upload/API/backend, console logging of data, browser persistence, analytics or external data service was added. Source files are read only. Session data is lost on reload/worker failure. Downloaded JSON contains sensitive exact before/after values. Browser tests retain the existing network/console checks; source inspection found no fetch/XHR/beacon or persistent-storage calls in `src/`. Static application/worker asset requests still go to the host when hosted.

## Benchmark method and environment

Raw evidence: [tests/benchmarks/results.json](./tests/benchmarks/results.json). Reproduce with `npm run benchmark`; Microsoft Edge, available local port 4174, and baseline commit `06ebe60` are required. No private datasets are stored. The harness reads the old source with `git show` into ignored `.tmp/` without checking out or modifying main.

Environment: Windows, Intel Core i5-6200U @ 2.30 GHz, four logical CPUs, approximately 7.88 GiB RAM, Node 24.21.0, headless Microsoft Edge 157.0.4341.46. Two repetitions per case, fresh browser context each time. This is a small controlled desktop sample, not a percentile study or mobile-device qualification.

The harness uses locally Vite-transformed modules. Production-build React UI tests are separate. Synthetic file generation and post-run correctness verification are excluded from timings; import includes file reading, parsing and analysis; clean includes proposal/apply; CSV/JSON timings include serialization/Blob creation. Baseline calls the original parser/transform/export helpers synchronously and bypasses its old file-size admission only for comparison. Its 25/50 MiB results do not mean the old app supported those sizes. High-shape cases exceed old structural limits and have no baseline comparison.

Test files have exact byte targets, mixed external LF/CRLF/CR endings, UTF-8 Tokyo/café text, quoted commas, escaped quotes, multiline fields, missing values and duplicates. All cleaning operations are enabled, including fill, on benchmark worker runs. Long payload fields remain unchanged. Separate regressions cover keep/remove missing strategies and large-value log rejection.

| Shape | Exact sizes | Input cells | Missing / duplicate rows | Detailed proposed changes |
| --- | --- | --- | --- | --- |
| Text-heavy: 10,000 x 10 | 5,242,880 / 10,485,760 / 26,214,400 / 52,428,800 bytes | 100,000 | 1,000 / 100 | 11,010 |
| Row-heavy: 100,000 x 10 | 10,485,760 bytes | 1,000,000 | 10,000 / 1,000 | 110,010 |
| Column-heavy: 5,000 x 200 | 26,214,400 bytes | 1,000,000 | 500 / 50 | 5,700 |

The benchmark worker uses a **test-only** 50 MiB admission / 64 Mi UTF-16-unit text budget. This override cannot be supplied to the production worker. Cases at or below 25 MiB fit the actual production-profile budgets; 50 MiB changes do not establish feasibility under its smaller text budget. Every worker case reparses its exported CSV and compares every value, and compares the complete JSON applied-change array with the worker's history. Unit tests additionally replay logs back into the applied dataset.

### Measured processing and responsiveness

| Size / shape / pipeline | Import ms | Clean ms | CSV ms | JSON ms | Worst heartbeat gap ms | Page heap MiB | Worker heap MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5 MiB / 10,000 x 10 / baseline | 462.4 | 91.4 | 99.7 | 87.3 | 784.5 | 65.5 | 0.5 |
| 5 MiB / 10,000 x 10 / worker | 753.4 | 390.0 | 179.0 | 28.5 | 17.4 | 1.7 | 44.0 |
| 10 MiB / 10,000 x 10 / baseline | 978.3 | 138.7 | 128.3 | 79.6 | 1329.7 | 98.4 | 0.5 |
| 10 MiB / 10,000 x 10 / worker | 906.5 | 475.0 | 349.9 | 44.8 | 30.3 | 1.7 | 63.4 |
| 25 MiB / 10,000 x 10 / baseline | 2049.8 | 234.2 | 302.1 | 173.8 | 2960.5 | 141.4 | 0.5 |
| 25 MiB / 10,000 x 10 / worker | 1905.4 | 791.6 | 632.7 | 31.3 | 22.7 | 1.7 | 127.8 |
| 50 MiB / 10,000 x 10 / baseline | 2916.7 | 403.8 | 580.4 | 356.5 | 4355.3 | 244.7 | 0.5 |
| 50 MiB / 10,000 x 10 / worker | 3419.8 | 1588.6 | 1308.2 | 30.6 | 25.2 | 1.8 | 231.8 |
| 10 MiB / 100,000 x 10 / worker | 1377.6 | 2926.5 | 1170.3 | 331.6 | 21.7 | 1.8 | 111.5 |
| 25 MiB / 5,000 x 200 / worker | 1942.9 | 1015.5 | 1204.6 | 27.0 | 44.4 | 1.7 | 149.5 |


Durations are arithmetic means of two runs in milliseconds. Heartbeat gaps and heap values are the worst observed across those runs. The heartbeat uses a 10 ms main-page timer. The benchmark page receives only metadata/Blobs, not the full React UI.

Heap figures are **sampled JS heap high-water marks**, not total peak browser/process memory. CDP samples page and worker heaps approximately every 25 ms; main-thread baseline blocking allows very few samples. Short-lived peaks, native Blob backing, external buffers and browser overhead can be missed. Separate page/worker maxima are not necessarily simultaneous and must not be summed into a claimed peak. GC timing also affects comparisons.

The worker's responsiveness gain is clear, but wall-clock work is not universally faster: cooperative yielding, detailed-log byte accounting and serialization add overhead. No blanket processing-speed improvement is claimed. The 50 MiB experiment consumes considerably more sampled worker heap and lacks lower-memory/mobile evidence; keep it unsupported.

### Actual production-build UI evidence

The 25 MiB UI test uploads a real synthetic File, navigates Settings and back while import is active, checks actual metrics and bounded previews, cancels replacement/clean/export, recalculates/applies, and requests a full CSV download larger than 24 MiB. Another test uploads 5,000 x 200 cells, verifies exactly 1,000 rendered data cells, and checks source-row pagination. A resource-failure test verifies an error instead of an automatic retry loop.

Final UI import sample: **218 heartbeat ticks, maximum gap 48.3 ms, Settings navigation 290 ms while import was still active**. Recorded in ignored Playwright output `ui-heartbeat.json`. This measures one test run, not a guaranteed latency on all machines.

## Verification results

| Command/check | Actual result |
| --- | --- |
| `npm test` | 44 passed: all 27 prior regressions plus 17 worker/stream/budget regressions |
| `npm run test:e2e` | 21 passed against production preview in Edge; original 18 scenarios retained, 3 large-file scenarios added |
| `npm run lint` | Passed |
| `npm run build` | Passed; emits a separate approximately 36.17 kB worker asset |
| `npm run benchmark` | 20 measured cases; 12 worker cases with CSV/log verification; 8 baseline comparisons |
| Accessibility/layout regression | Existing keyboard, focus, mobile navigation, 320/390/768/1024/1440 px layout and axe scenarios passed |
| Branch/index checks | Feature branch retained; main hash unchanged; no files staged by this task |

Coverage includes strict quotes, commas, multiline fields, UTF-8 across chunk boundaries, malformed input, blank/final empty records, duplicate headers, exact hashing collisions, inclusive limits, immutable originals, all missing strategies, trim/dedup/normalization, formula protection, raw export warnings, complete log replay, stale proposals, cancellation/failure, and download semantics. UTF-8 source encoding and visible-string regressions are retained. Existing size assertions were adapted to the measured new profile and explicit legacy-limit cases retained. No dependencies were added or upgraded.

## Files changed

- Architecture/report/docs: `LARGE_CSV_ARCHITECTURE.md`, `LARGE_CSV_RESULTS.md`, `README.md`; `RELEASE_AUDIT.md` gains a historical-profile notice without relabeling old results.
- Pipeline: new `src/lib/{limits,streamCsv,rowIndex,processing,workerClient}.js`, `src/workers/{csv.worker,workspace}.js`, `src/hooks/useCsvWorkspace.js`; `src/lib/csv.js` retains compatible pure helpers and accepts worker-produced Blobs.
- UI integration: `src/App.jsx`, `src/components/{ActivityLog,ChangePreview,CleaningPanel,DatasetTable,SettingsPanel,UploadPanel}.jsx`.
- QA/scripts: `package.json`, `src/lib/csv.test.js`, `tests/audit.test.js`, `tests/worker.test.js`, `tests/e2e/{workspace,large-files}.spec.js`, `scripts/benchmark.mjs`, `tests/benchmarks/{harness.html,harness.js,benchmark.worker.js,results.json}`. Generated private-sized synthetic files and browser artifacts remain ignored.

## Remaining risks and next gate

- Only Windows desktop Edge was benchmarked. Responsive viewport tests do not qualify actual mobile hardware, Safari or Firefox. Manual screen-reader review remains outstanding.
- Resource limits are deliberately conservative operation bounds. Repeated edits/long values can exhaust full-history budgets even for small imports. The app rejects rather than weakening preservation guarantees.
- Blob storage and actual process peak memory were not measurable with this sampler. A broader memory/GC/device study is required before increasing limits again.
- No worker crash recovery, persistence, autosave or disk-backed processing exists. Save/download data and logs before leaving or replacing a session.
- This task did not perform a new registry security audit or change the lockfile. The earlier audit is historical; recheck dependencies before a public release.
- Existing production hosting, worker MIME/CSP behavior, headers and asset routing were not tested. If separately authorized, validate a hosted preview before promoting a beta. There is no backend, database, authentication, cloud storage or new remote service.

Proceed only with a clearly labeled, bounded **25 MiB desktop beta** and the operation-budget limitations visible. **Do not advertise 50 MiB support** from these experiments. Broader hardware/browser testing and better total-memory instrumentation are the next gates; no deployment is performed here.
