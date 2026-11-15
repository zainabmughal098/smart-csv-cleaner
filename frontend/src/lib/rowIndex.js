export function hashRow(values) {
  let hash = 2166136261
  for (const value of values) {
    hash = Math.imul(hash ^ value.length, 16777619)
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

// Hashes narrow the candidates; exact comparisons determine equality. Even a
// deliberate collision cannot turn distinct records into duplicate removals.
export class ExactRowIndex {
  constructor(hash = hashRow) { this.hash = hash; this.buckets = new Map() }
  add(values) {
    const hash = this.hash(values)
    const bucket = this.buckets.get(hash)
    if (bucket) {
      for (const candidate of bucket) {
        if (candidate.length === values.length && candidate.every((value, index) => value === values[index])) return false
      }
      bucket.push(values)
    } else this.buckets.set(hash, [values])
    return true
  }
}
