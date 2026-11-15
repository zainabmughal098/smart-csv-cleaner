import { Workspace } from './workspace.js'

const workspace = new Workspace()
self.onmessage = async ({ data: { id, method, args } }) => {
  if (method === 'cancel') { workspace.cancel(args.id); return }
  try {
    const value = await workspace.handle(method, args, id, (progress) => self.postMessage({ id, progress }))
    self.postMessage({ id, value })
  } catch (error) {
    self.postMessage({ id, error: { name: error.name, message: error.message } })
  }
}
