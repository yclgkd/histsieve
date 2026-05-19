# Chrome Web Store Listing

## Store Assets

- Extension icon: `src/ui/icons/icon128.png`
- Small promotional image: `store-assets/promo-small-440x280.png`
- Screenshot 1: `store-assets/screenshot-options-1280x800.png`
- Screenshot 2: `store-assets/screenshot-popup-1280x800.png`
- Optional marquee image: `store-assets/marquee-1400x560.png`

Regenerate assets:

```bash
pnpm assets:store
```

Create upload package:

```bash
pnpm build:release
```

The release package is written to `release/histsieve-v<version>.zip`.

## English Listing

### Name

HistSieve

### Summary

Clean Chrome history locally by keyword, schedule, or age.

### Detailed Description

HistSieve helps you keep browser history tidy with local cleanup rules.

Add keywords such as domains, topics, or words you do not want to keep in history.
When a visited URL or page title matches an active keyword, HistSieve removes that
history entry from Chrome. You can also run cleanup manually, on a schedule, or when
Chrome starts.

Core features:

- Keyword-based cleanup for URLs and page titles
- Scheduled cleanup by interval
- Startup cleanup
- Manual cleanup from the popup or settings page
- Cleanup scope controls: all history or entries older than a chosen number of days
- Keyword import and export
- English and Simplified Chinese UI

Privacy-first design:

- No account
- No remote server
- No analytics
- No ads
- No sale or transfer of user data

HistSieve stores settings locally in Chrome extension storage and uses browser
history only to provide the cleanup features configured by the user.

## 中文 Listing

### 名称

HistSieve 历史筛除

### 简短说明

按关键词、计划或时间范围在本地清理 Chrome 历史记录。

### 详细说明

HistSieve 用本地规则帮助你清理 Chrome 浏览历史。

你可以添加域名、主题或任意关键词。当访问过的网址或页面标题命中生效关键词时，
HistSieve 会从 Chrome 历史记录中删除对应条目。你也可以手动清理、定时清理，
或在 Chrome 启动时自动清理。

核心功能：

- 按 URL 和页面标题关键词清理历史记录
- 按固定间隔定时清理
- Chrome 启动时清理
- 在弹窗或设置页手动清理
- 可选择清理全部历史，或仅清理早于指定天数的历史
- 关键词导入和导出
- 英文和简体中文界面

隐私设计：

- 不需要账号
- 不连接远程服务器
- 不做统计分析
- 不展示广告
- 不出售或转移用户数据

HistSieve 只把设置保存在 Chrome 扩展本地存储中，仅使用浏览历史来执行用户配置的
清理功能。

## Single Purpose

Clean Chrome browser history according to the user's local keyword and schedule
settings.

## Permission Justifications

### `history`

Required to search and delete Chrome history entries that match the user's cleanup
rules.

### `alarms`

Required to run scheduled cleanup at the interval configured by the user.

### `storage`

Required to save keyword rules, cleanup settings, and the last cleanup timestamp
locally.

## Privacy Tab Notes

HistSieve handles browsing history URLs and page titles locally only for matching
and deletion. It does not collect, transmit, sell, or share user data.

Suggested data disclosure:

- Web history: handled locally for user-requested cleanup.
- User activity: not collected remotely.
- Website content: not collected.
- Personally identifiable information: not collected.
- Authentication information: not collected.
- Financial/payment information: not collected.
- Health information: not collected.
- Location: not collected.

Limited use statement:

HistSieve uses browser history data only to provide its single purpose: cleaning
browser history according to the user's local settings. It does not use user data
for advertising, analytics, profiling, or personalized recommendations.

Privacy policy URL should point to `PRIVACY.md` in the public repository or a
hosted copy of the same policy.

## Test Instructions

1. Install the submitted extension package in Chrome.
2. Open the options page.
3. Add a keyword such as `example.com`.
4. Visit a matching URL.
5. Open Chrome history and confirm the matching entry is removed.
6. Open the popup and run manual cleanup.
7. Change the cleanup scope to entries older than 30 days and confirm the button text updates.
8. Export keywords, remove them, import the JSON file, and confirm the keyword list is restored.

No credentials or paid account are required.
