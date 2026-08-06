(function initCustomScheduleCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CustomScheduleCore = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function createCustomScheduleCore() {
  const chineseDigits = new Map([
    ["零", 0], ["〇", 0], ["一", 1], ["二", 2], ["两", 2], ["三", 3], ["四", 4],
    ["五", 5], ["六", 6], ["七", 7], ["八", 8], ["九", 9], ["十", 10]
  ]);

  function parseChineseNumber(value) {
    const text = String(value || "").trim();
    if (/^\d+$/.test(text)) return Number(text);
    if (!text || [...text].some((character) => !chineseDigits.has(character))) return NaN;
    if (text === "十") return 10;
    if (text.length === 2 && text.startsWith("十")) return 10 + chineseDigits.get(text[1]);
    if (text.length === 2 && text.endsWith("十")) return chineseDigits.get(text[0]) * 10;
    if (text.length === 3 && text[1] === "十") return chineseDigits.get(text[0]) * 10 + chineseDigits.get(text[2]);
    return chineseDigits.get(text);
  }

  function cleanTeamName(value) {
    return String(value || "")
      .replace(/[，,。；;！!]+/g, " ")
      .replace(/^(?:请|帮我|添加|安排|记录|新增|一场|有一场|比赛|赛程|在)\s*/g, "")
      .replace(/\s*(?:有一场|一场|比赛|赛程|在)$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function validDate(year, month, day) {
    const value = new Date(year, month - 1, day, 12, 0, 0, 0);
    return value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day ? value : null;
  }

  function parseDate(text, referenceDate = new Date()) {
    const input = String(text || "");
    const match = input.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/);
    if (!match) return { value: "", matchText: "" };
    const [, yearText, monthText, dayText] = match;
    let year = yearText ? Number(yearText) : referenceDate.getFullYear();
    const month = Number(monthText);
    const day = Number(dayText);
    let value = validDate(year, month, day);
    if (!value) return { value: "", matchText: match[0] };
    if (!yearText) {
      const referenceDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
      if (value.getTime() < referenceDay.getTime() - 7 * 24 * 60 * 60 * 1000) {
        year += 1;
        value = validDate(year, month, day);
      }
    }
    return {
      value: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`,
      matchText: match[0]
    };
  }

  function parseTime(text) {
    const input = String(text || "");
    const digital = input.match(/(?:上午|早上|中午|下午|晚上|晚)?\s*(\d{1,2})\s*[：:]\s*(\d{1,2})/);
    const chinese = input.match(/(上午|早上|中午|下午|晚上|晚)?\s*([零〇一二两三四五六七八九十\d]{1,3})\s*点\s*(半|[零〇一二两三四五六七八九十\d]{1,3}分?)?/);
    const match = digital || chinese;
    if (!match) return { value: "", matchText: "" };

    const period = match[1] || "";
    let hour = digital ? Number(match[1]) : parseChineseNumber(match[2]);
    let minute = 0;
    if (digital) {
      minute = Number(match[2]);
      const prefixedPeriod = input.slice(Math.max(0, match.index - 3), match.index).match(/上午|早上|中午|下午|晚上|晚/)?.[0] || "";
      if (prefixedPeriod) return applyPeriod(hour, minute, prefixedPeriod, match[0]);
    } else if (match[3] === "半") {
      minute = 30;
    } else if (match[3]) {
      minute = parseChineseNumber(String(match[3]).replace("分", ""));
    }
    return applyPeriod(hour, minute, period, match[0]);
  }

  function applyPeriod(hour, minute, period, matchText) {
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return { value: "", matchText };
    }
    if ((period === "下午" || period === "晚上" || period === "晚") && hour < 12) hour += 12;
    if (period === "中午" && hour < 11) hour += 12;
    if ((period === "上午" || period === "早上") && hour === 12) hour = 0;
    return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, matchText };
  }

  function parseTeams(text, dateMatchText, timeMatchText) {
    const source = String(text || "")
      .replace(dateMatchText || "", " ")
      .replace(timeMatchText || "", " ")
      .replace(/(?:请|帮我|添加|安排|记录|新增)\s*/g, "")
      .replace(/(?:有一场|一场)?(?:比赛|赛程)\s*/g, " ")
      .replace(/[，,。；;！!]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const homePattern = /^(.*?)\s*(?:在\s*)?(?:主场|坐镇主场)\s*(?:打|对阵|迎战|vs\.?|VS\.?)\s*(.+)$/i.exec(source);
    if (homePattern) return { homeTeam: cleanTeamName(homePattern[1]), awayTeam: cleanTeamName(homePattern[2]), orientation: "explicit-home" };

    const awayPattern = /^(.*?)\s*(?:在\s*)?(?:客场|作客)\s*(?:打|挑战|对阵|迎战|vs\.?|VS\.?)\s*(.+)$/i.exec(source);
    if (awayPattern) return { homeTeam: cleanTeamName(awayPattern[2]), awayTeam: cleanTeamName(awayPattern[1]), orientation: "explicit-away" };

    const neutralPattern = /^(.*?)\s*(?:对阵|迎战|打|vs\.?|VS\.?)\s*(.+)$/i.exec(source);
    if (neutralPattern) return { homeTeam: cleanTeamName(neutralPattern[1]), awayTeam: cleanTeamName(neutralPattern[2]), orientation: "assumed-home" };

    return { homeTeam: "", awayTeam: "", orientation: "" };
  }

  function parseScheduleDescription(text, options = {}) {
    const rawText = String(text || "").trim();
    const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
    const date = parseDate(rawText, referenceDate);
    const time = parseTime(rawText);
    const teams = parseTeams(rawText, date.matchText, time.matchText);
    const missing = [];
    if (!date.value) missing.push("日期");
    if (!time.value) missing.push("开赛时间");
    if (!teams.homeTeam || !teams.awayTeam) missing.push("双方球队");
    return {
      rawText,
      date: date.value,
      time: time.value,
      homeTeam: teams.homeTeam,
      awayTeam: teams.awayTeam,
      orientation: teams.orientation,
      missing,
      parser: "local"
    };
  }

  function isCompleteScheduleDraft(draft) {
    return Boolean(draft?.date && draft?.time && draft?.homeTeam && draft?.awayTeam && !(draft.missing || []).length);
  }

  function createCustomEvent(draft, options = {}) {
    if (!isCompleteScheduleDraft(draft)) throw new Error("赛程信息不完整");
    const start = new Date(`${draft.date}T${draft.time}:00`);
    if (!Number.isFinite(start.getTime())) throw new Error("日期或时间无效");
    const id = options.id || `custom-${start.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
    const homeTeam = cleanTeamName(draft.homeTeam);
    const awayTeam = cleanTeamName(draft.awayTeam);
    return {
      id,
      sourceId: id,
      source: "custom-agent",
      dataSource: "custom",
      custom: true,
      managedImport: false,
      league: "custom",
      leagueName: "自定义赛程",
      leagueColor: "#d7edf5",
      title: `${awayTeam} at ${homeTeam}`,
      shortTitle: `${homeTeam} vs ${awayTeam}`,
      homeTeam,
      awayTeam,
      homeLogo: "",
      awayLogo: "",
      homeScore: "",
      awayScore: "",
      status: "Scheduled",
      start: start.toISOString(),
      teamMeta: [
        { id: `custom-home-${homeTeam}`, name: homeTeam, shortName: homeTeam, logo: "" },
        { id: `custom-away-${awayTeam}`, name: awayTeam, shortName: awayTeam, logo: "" }
      ],
      customInput: String(draft.rawText || ""),
      createdAt: new Date().toISOString()
    };
  }

  return { createCustomEvent, isCompleteScheduleDraft, parseScheduleDescription };
}));
