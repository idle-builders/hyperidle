/**
 * Electron main process entry point.
 *
 * N4 stub — implementation pending.
 * See architecture.md §3 for the full startup sequence.
 */

export {};

// Main process implementation goes here.
// Key responsibilities:
//   1. app.requestSingleInstanceLock() — enforce single instance
//   2. app.whenReady() — wait for Electron to be ready
//   3. Resolve paths (dbPath, logDir, secretsPath)
//   4. Read or generate HYPERIDLE_API_KEY from secrets.json
//   5. Initialize log rotation
//   6. Run migrations (downgrade check → applyMigrations)
//   7. Set process.env variables
//   8. createServer(0) — start Hono server on random port
//   9. Extract port from httpServer.address()
//   10. Poll /api/health (30s timeout → error dialog)
//   11. Create BrowserWindow (restore window state)
//   12. Register IPC handlers for safeStorage
//   13. Build and set application menu
//   14. Graceful shutdown on before-quit
