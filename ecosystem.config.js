// PM2-Konfiguration für Production.
// Start:           pm2 start ecosystem.config.js
// Reload:          pm2 reload ai-stock-analyzer --update-env
// Logs:            pm2 logs ai-stock-analyzer
// Status:          pm2 status
//
// Wichtig zum PORT:
//   Next.js liest `PORT` NICHT aus .env.local — der HTTP-Listener bindet
//   sich schon bevor die App-Runtime die Datei einliest. Deshalb muss PORT
//   hier als echte Prozess-Umgebungsvariable gesetzt werden. Alle anderen
//   Werte (MONGODB_URI, JWT_SECRET, APP_SECRET_KEY, SMTP_*, APP_URL) lädt
//   Next.js aus .env.local selbst.
//
//   Wer den Port hier anpasst, muss PM2 zwingend mit --update-env starten,
//   damit der neue Wert in den Kind-Prozess übernommen wird:
//     pm2 reload ai-stock-analyzer --update-env
//     pm2 restart ai-stock-analyzer --update-env
module.exports = {
  apps: [
    {
      name: "ai-stock-analyzer",
      cwd: __dirname,
      script: "npm",
      args: "start",
      // Ein einziger Instance-Prozess. "cluster"-Mode würde sinnvoll sein, aber
      // der In-Memory-Rate-Limiter wäre dann inkonsistent (siehe DEPLOYMENT.md).
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      // Auto-Restart, wenn Prozess >500MB belegt — als Absicherung gegen
      // eventuelle Memory-Leaks im Long-Running-Betrieb. Grenze bei Bedarf
      // anpassen.
      max_memory_restart: "500M",
      // Warte 10s beim graceful-Shutdown, bevor PM2 hart SIGKILL sendet.
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
        // Hier anpassen, falls 3000 belegt ist. Nginx-Proxy muss dann auf
        // denselben Port zeigen.
        PORT: "3100",
      },
    },
  ],
};
