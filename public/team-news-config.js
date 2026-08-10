window.TeamNewsConfig = Object.freeze({
  defaultTeamId: "toronto-blue-jays",
  teams: Object.freeze({
    "toronto-blue-jays": Object.freeze({
      teamId: "toronto-blue-jays",
      teamName: "多伦多蓝鸟",
      teamNameEn: "Toronto Blue Jays",
      eyebrow: "MLB · Toronto Blue Jays",
      sourceLabel: "MLB.com",
      logoUrl: "public/assets/teams/toronto-blue-jays.png",
      emptyMessage: "暂时没有可显示的蓝鸟队新闻。",
      topic: "toronto_blue_jays_news_en",
      supportsNativeMlbFeed: true,
      supportsNativeArticle: true,
      bundledUrl: "public/news/blue-jays.json",
      apiUrl: "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/blue-jays.json",
      apiUrls: Object.freeze([
        "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/blue-jays.json",
        "https://cdn.jsdelivr.net/gh/Levine-Lai/calendar-app@main/public/news/blue-jays.json"
      ])
    }),
    arsenal: Object.freeze({
      teamId: "arsenal",
      teamName: "阿森纳",
      teamNameEn: "Arsenal",
      eyebrow: "PREMIER LEAGUE · Arsenal",
      sourceLabel: "Arsenal.com",
      logoUrl: "public/assets/teams/arsenal.png",
      emptyMessage: "暂时没有可显示的阿森纳新闻。",
      supportsNativeMlbFeed: false,
      supportsNativeArticle: false,
      bundledUrl: "public/news/arsenal.json",
      apiUrl: "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/arsenal.json",
      apiUrls: Object.freeze([
        "https://raw.githubusercontent.com/Levine-Lai/calendar-app/main/public/news/arsenal.json",
        "https://cdn.jsdelivr.net/gh/Levine-Lai/calendar-app@main/public/news/arsenal.json"
      ])
    })
  })
});
