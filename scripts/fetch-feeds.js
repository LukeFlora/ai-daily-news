#!/usr/bin/env node

/**
 * fetch-feeds.js
 * 
 * 核心数据抓取脚本（带周末断档与开机自动补齐感知）：
 * 1. 自动检测周末断档：
 *    - 如果今天是周一，或者检查到上一次运行时间是上周五（距今 >= 2天），
 *      系统会自动识别为“周末关机断档”，自动向前追溯 72 小时内的所有 GitHub 历史提交快照。
 * 2. 多天数据智能合并与去重：
 *    - 将周五下午、周六全天、周日全天及周一的数据全量拉取，按推文 ID/URL 去重。
 * 3. 结果保存至 data/raw/YYYY-MM-DD.json。
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const CONFIG_FEEDS = join(ROOT_DIR, 'config', 'feeds.json');
const RAW_DATA_DIR = join(ROOT_DIR, 'data', 'raw');
const DIGESTS_DIR = join(ROOT_DIR, 'data', 'digests');

// 网络请求助手，带超时与容错
async function fetchJSON(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (AI-Builders-Digest-Collector)'
      },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[Network] Fetch failed for ${url}:`, err.message);
    return null;
  }
}

// 格式化 YYYY-MM-DD
function formatDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 检测距离上一次运行过了多少天
async function getDaysSinceLastRun(todayStr) {
  try {
    const checkDir = existsSync(DIGESTS_DIR) ? DIGESTS_DIR : RAW_DATA_DIR;
    if (!existsSync(checkDir)) return 1;

    const files = (await readdir(checkDir))
      .filter(f => f.endsWith('.json') && !f.startsWith(todayStr))
      .sort()
      .reverse();

    if (files.length === 0) return 1;

    const lastFile = files[0];
    const lastDateStr = lastFile.replace('.json', '');
    const lastTime = new Date(lastDateStr).getTime();
    const todayTime = new Date(todayStr).getTime();
    const diffDays = Math.round((todayTime - lastTime) / (1000 * 60 * 60 * 24));

    return Math.max(1, diffDays);
  } catch {
    return 1;
  }
}

// 合并与去重推文数据
function mergeXData(feedList) {
  const builderMap = new Map();

  for (const feed of feedList) {
    if (!feed || !Array.isArray(feed.x)) continue;
    for (const builder of feed.x) {
      const key = builder.handle || builder.name;
      if (!builderMap.has(key)) {
        builderMap.set(key, {
          source: builder.source || 'x',
          name: builder.name,
          handle: builder.handle,
          bio: builder.bio,
          profileImageUrl: builder.profileImageUrl,
          tweets: []
        });
      }
      const existing = builderMap.get(key);
      const seenTweetIds = new Set(existing.tweets.map(t => t.id || t.url));

      for (const t of (builder.tweets || [])) {
        const id = t.id || t.url;
        if (!seenTweetIds.has(id)) {
          seenTweetIds.add(id);
          existing.tweets.push(t);
        }
      }
    }
  }

  // 排序并过滤空列表
  return Array.from(builderMap.values())
    .map(b => {
      b.tweets.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return b;
    })
    .filter(b => b.tweets.length > 0);
}

// 合并与去重播客数据
function mergePodcasts(feedList) {
  const seenUrls = new Set();
  const result = [];
  for (const feed of feedList) {
    if (!feed || !Array.isArray(feed.podcasts)) continue;
    for (const pod of feed.podcasts) {
      const key = pod.url || pod.title;
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        result.push(pod);
      }
    }
  }
  result.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return result;
}

// 合并与去重官方博客数据
function mergeBlogs(feedList) {
  const seenUrls = new Set();
  const result = [];
  for (const feed of feedList) {
    if (!feed || !Array.isArray(feed.blogs)) continue;
    for (const blog of feed.blogs) {
      const key = blog.url || blog.title;
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        result.push(blog);
      }
    }
  }
  return result;
}

// 主流程
async function main() {
  const args = process.argv.slice(2);
  const isForceWeekend = args.includes('--force-weekend');
  const dateArg = args.find(a => a.startsWith('--date='));
  const todayStr = dateArg ? dateArg.split('=')[1] : formatDate(new Date());

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = 周日, 1 = 周一, ..., 6 = 周六
  const daysSinceLast = await getDaysSinceLastRun(todayStr);

  // 判断是否需要进行周末回溯：
  // 1. 今天是周一 (dayOfWeek === 1)
  // 2. 距离上次收集超过2天 (例如从周五到周一，相隔3天，或者用户周二才开机)
  // 3. 命令行显式指定了 --force-weekend
  const isWeekendCatchup = dayOfWeek === 1 || daysSinceLast >= 2 || isForceWeekend;

  console.log(`\n======================================================`);
  console.log(`🤖 [AI Builders 采集器] 开始数据采集`);
  console.log(`- 目标日期: ${todayStr} (星期${['日','一','二','三','四','五','六'][dayOfWeek]})`);
  console.log(`- 距上次运行: ${daysSinceLast} 天`);
  console.log(`- 采集策略: ${isWeekendCatchup ? `🌟 周末补齐追溯模式 (自动合并周五/周六/周日多日数据)` : `常规工作日模式 (最新 24 小时)`}`);
  console.log(`======================================================\n`);

  const feedsConfig = JSON.parse(await readFile(CONFIG_FEEDS, 'utf-8'));
  const repo = feedsConfig.repo || 'zarazhangrui/follow-builders';

  const xFeeds = [];
  const podcastFeeds = [];
  const blogFeeds = [];

  // 1. 抓取当前最新的 Feed (main 分支)
  console.log(`[1/3] 正在拉取最新的主分支 Feed...`);
  const [latestX, latestPodcasts, latestBlogs] = await Promise.all([
    fetchJSON(feedsConfig.feeds.x),
    fetchJSON(feedsConfig.feeds.podcasts),
    fetchJSON(feedsConfig.feeds.blogs)
  ]);

  if (latestX) xFeeds.push(latestX);
  if (latestPodcasts) podcastFeeds.push(latestPodcasts);
  if (latestBlogs) blogFeeds.push(latestBlogs);

  // 2. 如果检测到跨越了周末，追溯过去 72~96 小时内的 GitHub 历史提交快照
  if (isWeekendCatchup) {
    const hoursToLookback = Math.min(120, Math.max(72, daysSinceLast * 24 + 12));
    console.log(`[2/3] 检测到周末关机断档，正在通过 GitHub API 追溯过去 ${hoursToLookback} 小时内的提交镜像...`);
    const lookbackTime = new Date(Date.now() - hoursToLookback * 60 * 60 * 1000).toISOString();
    const commitsUrl = `https://api.github.com/repos/${repo}/commits?path=feed-x.json&since=${lookbackTime}&per_page=15`;
    const commits = await fetchJSON(commitsUrl);

    if (Array.isArray(commits) && commits.length > 0) {
      console.log(`- 发现 ${commits.length} 个历史提交镜像，正在并发拉取周末各时段快照...`);
      const snapshotTasks = commits.slice(0, 6).map(async (c) => {
        const sha = c.sha;
        const [hX, hPod, hBlog] = await Promise.all([
          fetchJSON(`https://raw.githubusercontent.com/${repo}/${sha}/feed-x.json`),
          fetchJSON(`https://raw.githubusercontent.com/${repo}/${sha}/feed-podcasts.json`),
          fetchJSON(`https://raw.githubusercontent.com/${repo}/${sha}/feed-blogs.json`)
        ]);
        return { hX, hPod, hBlog };
      });

      const snapshots = await Promise.all(snapshotTasks);
      for (const s of snapshots) {
        if (s.hX) xFeeds.push(s.hX);
        if (s.hPod) podcastFeeds.push(s.hPod);
        if (s.hBlog) blogFeeds.push(s.hBlog);
      }
      console.log(`- 成功载入 ${snapshots.length} 份周末历史提交镜像进行深度合并。`);
    } else {
      console.warn(`- 未能拉取到历史提交列表（可能受网络波动或 GitHub API 限频），将以最新 Feed 为基准继续。`);
    }
  } else {
    console.log(`[2/3] 常规工作日运行，无需回溯周末数据。`);
  }

  // 3. 数据合并与去重
  console.log(`[3/3] 正在对推文、博客与播客进行全量合并与去重...`);
  const finalX = mergeXData(xFeeds);
  const finalPodcasts = mergePodcasts(podcastFeeds);
  const finalBlogs = mergeBlogs(blogFeeds);

  const totalTweets = finalX.reduce((acc, b) => acc + (b.tweets?.length || 0), 0);

  const mergedData = {
    date: todayStr,
    isMondayLookback: isWeekendCatchup,
    fetchedAt: new Date().toISOString(),
    stats: {
      buildersCount: finalX.length,
      totalTweets,
      podcastEpisodes: finalPodcasts.length,
      blogPosts: finalBlogs.length
    },
    x: finalX,
    podcasts: finalPodcasts,
    blogs: finalBlogs
  };

  // 4. 保存为 raw 数据
  await mkdir(RAW_DATA_DIR, { recursive: true });
  const rawFile = join(RAW_DATA_DIR, `${todayStr}.json`);
  await writeFile(rawFile, JSON.stringify(mergedData, null, 2), 'utf-8');

  console.log(`\n======================================================`);
  console.log(`✅ [完成] 数据采集成功！`);
  console.log(`- 涉及 AI Builders: ${finalX.length} 位`);
  console.log(`- 包含推文: ${totalTweets} 条`);
  console.log(`- 包含播客: ${finalPodcasts.length} 期`);
  console.log(`- 包含官方博客: ${finalBlogs.length} 篇`);
  console.log(`- 数据存储于: ${rawFile}`);
  console.log(`======================================================\n`);

  return mergedData;
}

main().catch(err => {
  console.error('[Error] 采集脚本运行异常:', err);
  process.exit(1);
});
