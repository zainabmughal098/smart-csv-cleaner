import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_OPTIONS, downloadFile } from '../lib/csv.js'
import { CsvWorkerClient } from '../lib/workerClient.js'

export default function useCsvWorkspace() {
  const [workspace, setWorkspace] = useState(null)
  const [options, updateOptions] = useState({ ...DEFAULT_OPTIONS })
  const [planned, setPlanned] = useState(null)
  const [operation, setOperation] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [previewNonce, setPreviewNonce] = useState(0)
  const [protectFormulas, setProtectFormulas] = useState(true)
  const client = useRef(null)
  const transaction = useRef(null)
  const revision = useRef(0)
  const cancelledPreview = useRef(-1)
  const getClient = useCallback(() => {
    if (!client.current) client.current = new CsvWorkerClient()
    return client.current
  }, [])
  useEffect(() => () => { client.current?.dispose(); client.current = null }, [])

  const perform = useCallback(async (method, body) => {
    if (transaction.current) return
    const context = { cancelled: false, cancellable: !['apply', 'reset'].includes(method), task: null, method }
    transaction.current = context
    setError('')
    setNotice('')
    setOperation({ method, phase: 'Starting local worker', cancellable: context.cancellable })
    let lastProgress = 0
    const request = async (name, args) => {
      if (context.cancelled) throw new DOMException('Operation cancelled.', 'AbortError')
      if (['commitImport', 'commitExport', 'apply', 'reset', 'discardImport'].includes(name)) {
        context.cancellable = false
        setOperation({ method, phase: 'Finishing local operation', cancellable: false })
      }
      context.task = getClient().request(name, args, (progress) => {
        const now = performance.now()
        if (now - lastProgress >= 50 || progress.completed === progress.total) {
          lastProgress = now
          setOperation({ method, ...progress, cancellable: context.cancellable })
        }
      })
      return await context.task.promise
    }
    try { await body(request, context) } catch (cause) {
      // A rejected/cancelled plan waits for changed options or an explicit retry.
      if (method === 'propose') cancelledPreview.current = revision.current
      if (cause.name === 'AbortError') setNotice('Operation cancelled. Current data and applied history are unchanged.')
      else setError(cause.message || 'The local CSV operation failed. Current data is unchanged.')
    } finally {
      if (transaction.current === context) { transaction.current = null; setOperation(null) }
    }
  }, [getClient])

  const setOptions = useCallback((next) => {
    revision.current += 1
    cancelledPreview.current = -1
    setPlanned(null)
    updateOptions(next)
  }, [])
  const resetOptions = useCallback(() => {
    revision.current += 1
    cancelledPreview.current = -1
    setPlanned(null)
    updateOptions({ ...DEFAULT_OPTIONS })
  }, [])

  const dataset = workspace?.current ?? null
  const version = workspace?.version ?? 0
  const metrics = workspace?.metrics ?? null
  const hasSelections = options.trim || options.standardize || options.deduplicate || options.missing !== 'keep'
  const proposal = useMemo(() => {
    if (!dataset) return null
    if (!hasSelections) return { changes: [], changeCount: 0, summary: {}, metrics, version }
    return planned?.version === version ? planned : null
  }, [dataset, hasSelections, planned, metrics, version])

  const calculate = useCallback(() => {
    const selectedRevision = revision.current
    return perform('propose', async (request) => {
      const result = await request('propose', { options })
      if (selectedRevision === revision.current) setPlanned({ ...result, revision: selectedRevision })
    })
  }, [options, perform])

  useEffect(() => {
    if (!dataset || !hasSelections || proposal || operation || cancelledPreview.current === revision.current) return
    const timer = setTimeout(calculate, 150)
    return () => clearTimeout(timer)
  }, [dataset, hasSelections, proposal, operation, calculate, previewNonce])

  const importFile = (selected) => perform('import', async (request) => {
    const result = await request('import', { file: selected })
    if (dataset && !window.confirm('Replace the current workspace with this file? Current applied changes, pending selections, and session history will be cleared. Your original files will stay untouched. Export anything you want to keep first.')) {
      await request('discardImport')
      return
    }
    const next = await request('commitImport', { token: result.token })
    resetOptions()
    setWorkspace(next)
    setNotice('CSV imported locally. No cleaning operations have been applied.')
  })

  const applyChanges = () => {
    if (transaction.current || !proposal?.changeCount || (options.missing === 'fill' && !options.fillValue.trim())) return
    const s = proposal.summary
    const details = `${s.trimmed} cells trimmed; ${s.renamed} columns renamed; ${s.filled} missing cells filled; ${s.missingRows + s.duplicates} rows removed (${s.missingRows} with missing values, ${s.duplicates} duplicates).`
    if (!window.confirm(`Apply these proposed changes to your working copy?\n\n${details}\n\nThis replaces the current working version. The original upload stays available and unchanged.`)) return
    return perform('apply', async (request) => {
      const next = await request('apply', { token: proposal.token })
      resetOptions()
      setWorkspace(next)
      setNotice(`Changes applied to version ${next.version}. Your original upload is preserved.`)
    })
  }

  const resetData = () => {
    if (!dataset || transaction.current || version === 1) return
    if (!window.confirm('Restore the original uploaded data? This replaces your current working copy and clears pending selections. Applied changes remain recorded in the session log.')) return
    return perform('reset', async (request) => {
      const next = await request('reset')
      resetOptions()
      setWorkspace(next)
      setNotice('Original data restored in the working copy.')
    })
  }

  const exportData = (format) => {
    if (!dataset || transaction.current) return
    const formulaRisks = workspace.formulaRisks
    if (format === 'Csv' && formulaRisks && !window.confirm(protectFormulas
      ? `Formula protection will prefix ${formulaRisks} potentially risky headers or cells with an apostrophe in the download. This changes exported text, including negative numeric strings, but does not change your working data or original file. No CSV protection works in every spreadsheet. Continue?`
      : `Export without formula protection? ${formulaRisks} headers or cells may be interpreted as spreadsheet formulas. Do not open an untrusted raw export in a spreadsheet. Your working data and original file remain unchanged. Continue?`)) return
    return perform(`export${format}`, async (request, context) => {
      const result = await request(`export${format}`, { protectFormulas })
      if (context.cancelled) throw new DOMException('Export cancelled.', 'AbortError')
      context.cancellable = false
      const basename = workspace.file.name.replace(/\.csv$/i, '')
      const filename = format === 'Csv' ? `${basename}_v${version}${protectFormulas && formulaRisks ? '_protected' : ''}.csv` : `${basename}_change-log.json`
      downloadFile(result.blob, filename, result.blob.type)
      setWorkspace(await request('commitExport', { token: result.token }))
      setNotice(format === 'Csv' ? `CSV download requested for applied version ${version}. Pending changes are excluded.` : 'Change log download requested. It contains all applied changes and session events.')
    })
  }

  const loadPage = useCallback((args) => getClient().request('page', args).promise, [getClient])
  return {
    workspace, dataset, original: workspace?.original ?? null, file: workspace?.file ?? null,
    sessionId: workspace?.sessionId, hasApplied: workspace?.hasApplied, hasExported: workspace?.hasExported,
    version, metrics, entries: workspace?.events ?? [], eventCount: workspace?.eventCount ?? 0, proposal, options, setOptions,
    error, setError, notice, setNotice, operation, importFile, applyChanges, resetData, loadPage,
    busy: !!operation || !dataset,
    loading: operation?.method === 'import',
    recalculate: () => { cancelledPreview.current = -1; setPreviewNonce((value) => value + 1) },
    cancel: () => {
      const context = transaction.current
      if (!context?.cancellable) return
      if (context.method === 'propose') cancelledPreview.current = revision.current
      context.cancelled = true
      context.task?.cancel()
      setOperation((current) => ({ ...current, phase: 'Cancellation requested; finishing the current batch', cancellable: false }))
    },
    exportProps: {
      disabled: !!operation || !dataset, version, hasProposals: !!proposal?.changeCount,
      onCsv: () => exportData('Csv'), onLog: () => exportData('Log'), onReset: resetData,
      protectFormulas, onProtectFormulasChange: setProtectFormulas, formulaRisks: workspace?.formulaRisks ?? 0,
    },
    exportCsv: () => exportData('Csv'),
  }
}
