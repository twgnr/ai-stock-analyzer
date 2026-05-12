export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerCronJobs } = await import("./lib/cron");
    registerCronJobs();
  }
}
