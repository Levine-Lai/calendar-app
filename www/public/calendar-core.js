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
      color: team.color || team.importedTeamColor || "#c7e6eb",
      logo: team.logo || team.importedTeamLogo || ""
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
    if (!existing) {
      const importedTeams = getEventImportedTeams(incoming);
      return importedTeams.length
        ? applyCompatibilityTeamFields({ ...incoming }, importedTeams)
        : { ...incoming };
    }
    const importedTeams = mergeImportedTeams(
      getEventImportedTeams(existing),
      getEventImportedTeams(incoming)
    );
    const merged = { ...existing, ...incoming };
    return importedTeams.length
      ? applyCompatibilityTeamFields(merged, importedTeams)
      : merged;
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

  function getMonthGridRange(cursor) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 41);
    return { start, end };
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
    deriveFollowedTeams,
    detachTeamFromEvent,
    getEventImportedTeams,
    getMonthGridRange,
    mergeEventRecords,
    mergeImportedTeams,
    normalizeImportedTeam,
    parseBoolean,
    parseIcsDate,
    teamKey
  };
}));
