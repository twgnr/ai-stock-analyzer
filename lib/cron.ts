import cron from "node-cron";
import { checkAlerts } from "./alertsService";
import { captureSnapshotsForAllUsers } from "./snapshotService";
import { sendDigestsForAllEligibleUsers } from "./digestService";
import { runAutoUpdate, shouldRunAutoUpdate } from "./autoUpdateService";

let started = false;

export function registerCronJobs() {
  if (started) return;
  started = true;

  cron.schedule("*/15 * * * *", async () => {
    try {
      const r = await checkAlerts();
      if (r.triggered > 0) {
        console.log(`[cron/alerts] checked=${r.checked} triggered=${r.triggered}`);
      }
    } catch (e) {
      console.error("[cron/alerts]", e instanceof Error ? e.message : e);
    }
  });

  cron.schedule("55 23 * * *", async () => {
    try {
      const r = await captureSnapshotsForAllUsers();
      console.log(`[cron/snapshot] processed=${r.processed} captured=${r.captured}`);
    } catch (e) {
      console.error("[cron/snapshot]", e instanceof Error ? e.message : e);
    }
  });

  cron.schedule("0 8 * * *", async () => {
    try {
      const r = await sendDigestsForAllEligibleUsers();
      console.log(`[cron/digest] processed=${r.processed} sent=${r.sent}`);
    } catch (e) {
      console.error("[cron/digest]", e instanceof Error ? e.message : e);
    }
  });

  // Auto-Update tickt jede Minute. Der Service entscheidet selbst, ob das
  // konfigurierte Intervall (z. B. 30 Min) abgelaufen ist und tatsächlich
  // ein Refresh fällig ist — sonst frühes Return ohne Last.
  cron.schedule("* * * * *", async () => {
    try {
      const check = await shouldRunAutoUpdate();
      if (!check.shouldRun) return;
      const r = await runAutoUpdate();
      if (r.ok) {
        console.log(
          `[cron/autoupdate] tickers=${r.tickersRefreshed} quotes=${r.quotesFetched} movers=${r.moversScanned}/${r.moversScanned + r.moversFailed} dauer=${r.durationMs}ms`
        );
      }
    } catch (e) {
      console.error("[cron/autoupdate]", e instanceof Error ? e.message : e);
    }
  });

  console.log(
    "[cron] 4 jobs registered: alerts (*/15min), snapshots (23:55), digest (08:00), autoupdate (*/1min, intervall-gated)"
  );
}
