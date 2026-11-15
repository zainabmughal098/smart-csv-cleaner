export class CsvWorkerClient {
  constructor() {
    this.pending = new Map()
    this.sequence = 0
    this.worker = new Worker(new URL('../workers/csv.worker.js', import.meta.url), { type: 'module' })
    this.worker.onmessage = ({ data }) => {
      const pending = this.pending.get(data.id)
      if (!pending) return
      if (data.progress) { if (!pending.cancelled) pending.onProgress(data.progress); return }
      this.pending.delete(data.id)
      if (pending.cancelled) pending.reject(new DOMException('Operation cancelled. Current data is unchanged.', 'AbortError'))
      else if (data.error) pending.reject(Object.assign(new Error(data.error.message), { name: data.error.name }))
      else pending.resolve(data.value)
    }
    this.worker.onerror = () => {
      for (const pending of this.pending.values()) pending.reject(new Error('The CSV worker failed. Reload to start a new workspace; no file on disk was modified.'))
      this.pending.clear()
      this.failed = true
    }
  }

  request(method, args = {}, onProgress = () => {}) {
    if (this.failed) throw new Error('CSV processing is unavailable. Reload the page to restart the worker.')
    const id = ++this.sequence
    const pending = { onProgress, cancelled: false }
    const promise = new Promise((resolve, reject) => { Object.assign(pending, { resolve, reject }); this.pending.set(id, pending) })
    this.worker.postMessage({ id, method, args })
    return {
      id, promise,
      cancel: () => { pending.cancelled = true; this.worker.postMessage({ id: 0, method: 'cancel', args: { id } }) },
    }
  }

  dispose() {
    this.worker.terminate()
    for (const pending of this.pending.values()) pending.reject(new DOMException('Workspace closed.', 'AbortError'))
    this.pending.clear()
  }
}
