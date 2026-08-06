// Configure a server-side parser endpoint here after it is deployed. Keep API
// keys on that server (or in a GitHub/Firebase secret), never in the APK.
window.CustomScheduleAgentConfig = Object.freeze({
  endpoint: "https://sports-calendar-schedule-agent.nbafantasy.workers.dev/v1/parse",
  timeoutMs: 12000
});
