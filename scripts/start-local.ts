import { notify, parseArgs, runStarter } from './local-io.ts'

const args = parseArgs(process.argv.slice(2))
void runStarter(args).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  notify(message, 'dialog')
  process.exit(2)
})
