package com.local.sportscalendar;

import java.util.Date;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

final class GameStatus {
    enum Kind { SCHEDULED, LIVE, FINISHED, POSTPONED, CANCELED }

    private static final long START_GRACE_MS = TimeUnit.MINUTES.toMillis(5);

    private GameStatus() {}

    static Kind classify(String statusValue, String stateValue, boolean completed) {
        String status = clean(statusValue);
        String state = clean(stateValue);
        if (isCanceledText(status)) return Kind.CANCELED;
        if (isPostponedText(status)) return Kind.POSTPONED;
        if (completed || isFinishedText(status)) return Kind.FINISHED;
        if ("in".equals(state) || isLiveText(status)) return Kind.LIVE;
        if ("post".equals(state)) return Kind.FINISHED;
        return Kind.SCHEDULED;
    }

    static boolean isLive(String status, String state, boolean completed, Date start) {
        if (start != null && start.getTime() > System.currentTimeMillis() + START_GRACE_MS) return false;
        return classify(status, state, completed) == Kind.LIVE;
    }

    static boolean isFinished(String status, String state, boolean completed) {
        return classify(status, state, completed) == Kind.FINISHED;
    }

    static boolean isLiveText(String value) {
        String status = clean(value);
        if (status.isEmpty() || isTerminalExceptionText(status) || isFinishedText(status)) return false;
        return status.matches(".*\\bin progress\\b.*")
            || status.equals("live")
            || status.equals("playing")
            || status.matches("(top|bot|bottom|mid|middle)\\s+\\d+(st|nd|rd|th)?")
            || status.equals("halftime")
            || status.equals("half time")
            || status.equals("break time")
            || status.equals("overtime")
            || status.equals("extra time")
            || status.equals("ht")
            || status.equals("1h")
            || status.equals("2h")
            || status.equals("et")
            || status.equals("bt")
            || status.equals("p")
            || status.equals("ot")
            || status.matches("q[1-4]")
            || status.matches("in\\d+")
            || status.matches("\\d{1,3}\\s*['’]")
            || status.contains("进行")
            || status.contains("上半场")
            || status.contains("下半场")
            || status.equals("中场");
    }

    static boolean isFinishedText(String value) {
        String status = clean(value);
        if (isTerminalExceptionText(status)) return false;
        return status.contains("final")
            || status.contains("full time")
            || status.contains("match finished")
            || status.contains("已结束")
            || status.contains("完场")
            || status.equals("played")
            || status.equals("ft")
            || status.equals("aet")
            || status.equals("aot")
            || status.equals("pen");
    }

    static boolean isPostponedText(String value) {
        String status = clean(value);
        return status.contains("postponed")
            || status.contains("delayed")
            || status.contains("延期")
            || status.contains("推迟");
    }

    static boolean isCanceledText(String value) {
        String status = clean(value);
        return status.contains("canceled")
            || status.contains("cancelled")
            || status.contains("abandoned")
            || status.contains("suspended")
            || status.contains("取消")
            || status.contains("中止")
            || status.contains("腰斩");
    }

    private static boolean isTerminalExceptionText(String status) {
        return isPostponedText(status) || isCanceledText(status);
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.US);
    }
}
