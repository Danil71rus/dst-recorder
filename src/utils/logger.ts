import log from "electron-log"

const isDev = process.env.NODE_ENV === "development"

try {
  // File logging configuration
  log.transports.file.level = "info"
  // Console is less verbose in production
  log.transports.console.level = isDev ? "debug" : "warn"

  // Add timestamped lines to file
  // Example: 2025-08-31 20:17:10.123 [info] {scope} message
  // @ts-ignore - format is available in electron-log
  log.transports.file.format = "{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {scope} {text}"

  // Catch unhandled errors and promise rejections
  // @ts-ignore - catchErrors is available in electron-log
  log.catchErrors({ showDialog: false })

  log.info("Logger initialized. isDev=", isDev)
} catch (e) {
  // Fallback to console if logger initialization fails
  // eslint-disable-next-line no-console
  console.error("Failed to initialize logger", e)
}

export const logger = log