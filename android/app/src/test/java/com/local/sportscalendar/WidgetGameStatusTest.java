package com.local.sportscalendar;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class WidgetGameStatusTest {
    @Test
    public void liveStateIsRecognized() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Top 5th";
        game.statusState = "in";
        game.completed = false;

        assertTrue(MlbTodayWidgetProvider.isLive(game));
        assertFalse(MlbTodayWidgetProvider.isFinished(game));
    }

    @Test
    public void completedGameCannotRemainLive() {
        MlbTodayWidgetProvider.Game game = new MlbTodayWidgetProvider.Game();
        game.status = "Final";
        game.statusState = "post";
        game.completed = true;

        assertTrue(MlbTodayWidgetProvider.isFinished(game));
        assertFalse(MlbTodayWidgetProvider.isLive(game));
    }
}
