(function initCalendarCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CalendarCore = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createCalendarCore() {
  function teamKey(team) {
    if (!team?.league || team.id == null || team.id === "") return "";
    return `${team.league}:${String(team.id)}`;
  }

  function normalizeImportedTeam(team, fallbackLeague = "") {
    if (!team) return null;
    const league = team.league || fallbackLeague;
    const id = String(team.id || team.importedTeamId || "");
    if (!league || !id) return null;
    return {
      key: `${league}:${id}`,
      id,
      league,
      leagueName: team.leagueName || league,
      name: team.name || team.importedTeamName || team.abbreviation || id,
      shortName: team.shortName || team.name || team.importedTeamName || "",
      abbreviation: team.abbreviation || team.importedTeamAbbreviation || "",
      color: sanitizeColor(team.color || team.importedTeamColor, "#c7e6eb"),
      logo: normalizeImageUrl(team.logo || team.importedTeamLogo || "", "")
    };
  }

  function getEventImportedTeams(event) {
    const teams = Array.isArray(event?.importedTeams) ? event.importedTeams : [];
    const normalized = teams
      .map((team) => normalizeImportedTeam(team, event?.league || ""))
      .filter(Boolean);
    if (normalized.length) return mergeImportedTeams(normalized);

    const legacy = normalizeImportedTeam({
      id: event?.importedTeamId,
      league: event?.league,
      leagueName: event?.leagueName,
      name: event?.importedTeamName,
      abbreviation: event?.importedTeamAbbreviation,
      color: event?.importedTeamColor,
      logo: event?.importedTeamLogo
    });
    return legacy ? [legacy] : [];
  }

  function mergeImportedTeams(...groups) {
    const byKey = new Map();
    groups.flat().forEach((team) => {
      const normalized = normalizeImportedTeam(team, team?.league || "");
      if (!normalized) return;
      byKey.set(normalized.key, { ...byKey.get(normalized.key), ...normalized });
    });
    return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  }

  function applyCompatibilityTeamFields(event, importedTeams) {
    const primary = importedTeams[0];
    if (!primary) {
      const clean = { ...event, importedTeams: [] };
      delete clean.importedTeamId;
      delete clean.importedTeamName;
      delete clean.importedTeamAbbreviation;
      delete clean.importedTeamColor;
      delete clean.importedTeamLogo;
      return clean;
    }
    return {
      ...event,
      managedImport: true,
      importedTeams,
      importedTeamId: primary.id,
      importedTeamName: primary.name,
      importedTeamAbbreviation: primary.abbreviation,
      importedTeamColor: primary.color,
      importedTeamLogo: primary.logo
    };
  }

  function attachTeamToEvent(event, team) {
    const importedTeam = normalizeImportedTeam(team, event?.league || "");
    if (!importedTeam) return { ...event };
    return applyCompatibilityTeamFields(
      { ...event, managedImport: true },
      mergeImportedTeams(getEventImportedTeams(event), [importedTeam])
    );
  }

  function mergeEventRecords(existing, incoming) {
    const normalizedIncoming = normalizeEventScores(incoming);
    if (!existing) {
      const importedTeams = getEventImportedTeams(normalizedIncoming);
      return importedTeams.length
        ? applyCompatibilityTeamFields({ ...normalizedIncoming }, importedTeams)
        : { ...normalizedIncoming };
    }
    const normalizedExisting = normalizeEventScores(existing);
    const importedTeams = mergeImportedTeams(
      getEventImportedTeams(normalizedExisting),
      getEventImportedTeams(normalizedIncoming)
    );
    const merged = { ...normalizedExisting };
    Object.entries(normalizedIncoming || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (typeof value === "string" && !value.trim() && hasMeaningfulValue(normalizedExisting[key])) return;
      if (Array.isArray(value) && !value.length && Array.isArray(normalizedExisting[key]) && normalizedExisting[key].length) return;
      merged[key] = value;
    });
    return importedTeams.length
      ? applyCompatibilityTeamFields(merged, importedTeams)
      : merged;
  }

  function normalizeEventScores(event) {
    if (!event || typeof event !== "object") return event || {};
    return {
      ...event,
      homeScore: normalizeScoreValue(event.homeScore),
      awayScore: normalizeScoreValue(event.awayScore)
    };
  }

  function normalizeScoreValue(value, depth = 0) {
    if (value == null || depth > 3) return "";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    if (typeof value === "object") {
      if (Array.isArray(value)) return "";
      for (const key of ["displayValue", "value", "score", "total", "points"]) {
        if (!(key in value)) continue;
        const normalized = normalizeScoreValue(value[key], depth + 1);
        if (normalized) return normalized;
      }
      return "";
    }
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (!text || /^(null|undefined|nan|\[object object\])$/i.test(text)) return "";
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        return normalizeScoreValue(JSON.parse(text), depth + 1);
      } catch {
        return "";
      }
    }
    return text;
  }

  function isInvalidScoreValue(value) {
    if (value == null || value === "") return false;
    return !normalizeScoreValue(value) && (typeof value === "object" || /\[object object\]/i.test(String(value)));
  }

  function hasMeaningfulValue(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  function sanitizeColor(value, fallback = "#c7e6eb") {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) || /^#[0-9a-f]{3}$/i.test(color)
      ? color.toLowerCase()
      : fallback;
  }

  function detachTeamFromEvent(event, key) {
    const importedTeams = getEventImportedTeams(event);
    if (!importedTeams.some((team) => team.key === key)) return { ...event };
    const remaining = importedTeams.filter((team) => team.key !== key);
    if (!remaining.length && event.managedImport !== false) return null;
    return applyCompatibilityTeamFields({ ...event }, remaining);
  }

  function deriveFollowedTeams(events, savedTeams = []) {
    return mergeImportedTeams(
      savedTeams,
      (events || []).flatMap((event) => getEventImportedTeams(event))
    );
  }

  function parseBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value !== "string") return fallback;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "是"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "否", ""].includes(normalized)) return false;
    return fallback;
  }

  function normalizeImageUrl(value, fallback = "") {
    const source = String(value || "").trim();
    if (!source) return fallback;
    if (source.startsWith("//")) return `https:${source}`;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(source)) return source;
    try {
      const url = new URL(source);
      if (url.protocol === "http:") url.protocol = "https:";
      return url.protocol === "https:" ? url.href : fallback;
    } catch {
      return fallback;
    }
  }

  function getMonthGridRange(cursor) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 41);
    return { start, end };
  }

  function isEventLive(event, options = {}) {
    if (isEventFuture(event, options)) return false;
    return classifyEventStatus(event) === "live";
  }

  function isEventFinished(event) {
    return classifyEventStatus(event) === "finished";
  }

  function isEventFuture(event, options = {}) {
    const startTime = Date.parse(event?.start || "");
    if (!Number.isFinite(startTime)) return false;
    const nowValue = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
    const graceMs = Number(options.graceMs ?? 5 * 60 * 1000);
    return startTime > nowValue + graceMs;
  }

  function isLiveStatusText(value) {
    const status = String(value || "").trim().toLowerCase();
    if (!status || isTerminalExceptionStatusText(status) || isFinishedStatusText(status)) return false;
    return /\bin progress\b/.test(status)
      || status === "live"
      || status === "playing"
      || /^(top|bot|bottom|mid|middle)\s+\d+(st|nd|rd|th)?$/.test(status)
      || status === "halftime"
      || status === "half time"
      || status === "break time"
      || status === "overtime"
      || status === "extra time"
      || status === "ht"
      || status === "1h"
      || status === "2h"
      || status === "et"
      || status === "bt"
      || status === "p"
      || status === "ot"
      || /^q[1-4]$/.test(status)
      || /^in\d+$/.test(status)
      || /^\d{1,3}\s*['’]$/.test(status)
      || status.includes("进行")
      || status.includes("上半场")
      || status.includes("下半场")
      || status === "中场";
  }

  function isFinishedStatusText(value) {
    const status = String(value || "").trim().toLowerCase();
    if (isTerminalExceptionStatusText(status)) return false;
    return status.includes("final")
      || status.includes("full time")
      || status.includes("match finished")
      || status.includes("已结束")
      || status.includes("完场")
      || status === "played"
      || status === "ft"
      || status === "aet"
      || status === "aot"
      || status === "pen";
  }

  function isPostponedStatusText(value) {
    const status = String(value || "").trim().toLowerCase();
    return status.includes("postponed")
      || status.includes("delayed")
      || status.includes("延期")
      || status.includes("推迟");
  }

  function isCanceledStatusText(value) {
    const status = String(value || "").trim().toLowerCase();
    return status.includes("canceled")
      || status.includes("cancelled")
      || status.includes("abandoned")
      || status.includes("suspended")
      || status.includes("取消")
      || status.includes("中止")
      || status.includes("腰斩");
  }

  function isTerminalExceptionStatusText(value) {
    return isPostponedStatusText(value) || isCanceledStatusText(value);
  }

  function classifyEventStatus(event) {
    const status = String(event?.status || "").trim();
    const stateValue = String(event?.statusState || "").trim().toLowerCase();
    if (isCanceledStatusText(status)) return "canceled";
    if (isPostponedStatusText(status)) return "postponed";
    if (parseBoolean(event?.completed, false) || isFinishedStatusText(status)) return "finished";
    if (stateValue === "in" || isLiveStatusText(status)) return "live";
    if (stateValue === "post") return "finished";
    return "scheduled";
  }

  function timeZoneOffsetAt(timestamp, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    const values = Object.fromEntries(
      formatter.formatToParts(new Date(timestamp))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)])
    );
    return Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    ) - timestamp;
  }

  function zonedDateTimeToIso(parts, timeZone) {
    const wallClock = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    let timestamp = wallClock;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      timestamp = wallClock - timeZoneOffsetAt(timestamp, timeZone);
    }
    return new Date(timestamp).toISOString();
  }

  function parseIcsDate(value, timeZone = "") {
    if (!value) return "";
    if (/^\d{8}T\d{6}Z$/.test(value)) {
      return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
    }
    if (/^\d{8}T\d{6}$/.test(value)) {
      const parts = {
        year: Number(value.slice(0, 4)),
        month: Number(value.slice(4, 6)),
        day: Number(value.slice(6, 8)),
        hour: Number(value.slice(9, 11)),
        minute: Number(value.slice(11, 13)),
        second: Number(value.slice(13, 15))
      };
      if (timeZone) {
        try {
          return zonedDateTimeToIso(parts, timeZone);
        } catch {
          // Fall back to a local timestamp when the supplied TZID is unsupported.
        }
      }
      return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
    }
    if (/^\d{8}$/.test(value)) {
      return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00`;
    }
    return value;
  }

  return {
    attachTeamToEvent,
    classifyEventStatus,
    deriveFollowedTeams,
    detachTeamFromEvent,
    getEventImportedTeams,
    getMonthGridRange,
    isEventFinished,
    isEventFuture,
    isEventLive,
    isFinishedStatusText,
    isLiveStatusText,
    mergeEventRecords,
    normalizeScoreValue,
    isInvalidScoreValue,
    mergeImportedTeams,
    normalizeImportedTeam,
    normalizeImageUrl,
    parseBoolean,
    parseIcsDate,
    sanitizeColor,
    teamKey
  };
}));
