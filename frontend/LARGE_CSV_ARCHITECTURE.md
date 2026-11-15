# Large CSV work: architecture decision record

Branch: `feature/large-csv-support`. Written before implementation. Production/main is not changed, committed, merged, pushed, or deployed by this work.

## Audit of the existing pipeline

- `readCsvFile` reads the entire byte buffer, decodes an entire string, creates a normalized string, calls Papa Parse, copies its records array, and wraps rows. All parsing/validation after the read runs on the main thread.
- App stores original/current/proposed datasets and detailed history in React. Initial original/current alias safely, but every proposal creates row/value arrays even with no selected operations. Selection changes synchronously scan all values in render-time `useMemo`.
- Exact duplicate detection retains JSON-serialized copies of complete rows. `buildProposal` constructs these keys even when deduplication is off. Metrics and formula scans repeat for current and proposed data.
- Before/after scans the entire proposed dataset again. Pagination limits DOM rows but does not limit the data resident on the main thread; enormous individual cell values also reach the DOM unbounded.
- CSV export creates a complete array-of-arrays and complete output string before Blob encoding. JSON export stringifies the entire sensitive change log on the main thread.
- No cooperative cancellation or progress exists. Full detailed changes and repeated history can consume more memory than the input CSV. File bytes alone are therefore an inadequate limit.

## Proposed changes and invariants

1. Use a Vite module worker as the sole owner of canonical original/current/proposed data and complete history. RPC results contain metrics, headers, bounded preview pages/first changes, and export Blobs; no full dataset is cloned into React. Do not silently fall back to synchronous UI processing if workers fail.
2. Read the File in bounded byte slices with a fatal streaming UTF-8 decoder. A small quote-aware record framer handles strict quoting and mixed external CR/LF separators across chunk boundaries. Papa Parse parses batches of complete records. Quoted internal line endings remain unchanged. Built-in Papa `worker: true` is not used inside the dedicated worker: returning its full parse results to React would defeat worker ownership, and the existing strict mixed-ending guarantees need framing before parsing.
3. Keep pure synchronous helpers for deterministic regressions, but share cleaning logic with a generator exhausted cooperatively in the worker. Yield between chunks/row batches so cancel/page requests are handled. Stop pending work transactionally: cancellation/failure never replaces current/original data or appends an applied event.
4. Preserve copy-on-write row/value references for unchanged data. Replace retained full-row JSON keys with hash buckets containing row references plus exact cell comparisons, so collisions never remove a different row. Cache only small metrics per dataset.
5. Parse/validate a replacement before confirming it, then explicitly commit or discard that pending import. Bind proposals to current version/options, and disable application while preview is stale or pending. Apply/reset retain explicit confirmations and stable source-row IDs.
6. Produce CSV/JSON in bounded pieces in the worker and return a Blob. Preserve formula escaping, full before/after logs, import/export events and source IDs. Cancel before download means no export event. Bound expanded dataset text, detailed proposal size, retained history, and export output; reject excessive operations before applying instead of dropping details.
7. UI progress reports actual bytes read or rows/entries processed, with phase labels rather than invented ETA. Cancellation is cooperative, so a single giant record/value can delay acknowledgement. Show bounded/truncated previews explicitly; exports/logs remain complete.

## Measurement gate (not a support claim)

Initially keep a separately named candidate profile for benchmark development. Exercise approximately 5/10/25/50 MiB with controlled shapes, plus row-heavy and column-heavy datasets, mixed newlines/UTF-8, change-heavy and expansion-budget failures. Choose the final public branch limits only after results. A 50 MiB experiment must not automatically become supported.

Compare baseline commit `06ebe60` with the new worker pipeline. Measure import/proposal/export time, event-loop heartbeat delay, sampled worker/main JS heap where available, and serialized output sizes. Heap samples are not total process peak memory: native Blob buffers, GC timing, and browser overhead may be excluded. Record environment, shapes, exact byte counts, and repetitions, and never market one machine as universal device support.

Verify the existing correctness/browser suite, chunk-boundary regressions, cancellation and stale-result races, original preservation, replayable complete logs, exact collision handling, resource budgets, and local-only network behavior. Run production build/lint/unit/browser tests. Record findings/results and remaining risks in `LARGE_CSV_RESULTS.md` and update README/UI only to measured limits.

References: [Papa Parse](https://www.papaparse.com/docs), [worker message/copy semantics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers), [browser memory measurement limitations](https://developer.chrome.com/docs/devtools/memory-problems).
