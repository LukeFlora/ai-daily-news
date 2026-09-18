#!/usr/bin/env node

/**
 * fetch-github-trending.js
 * 
 * 定时抓取 GitHub 每日热门与爆发开源项目：
 * 1. 主路径：抓取官方 GitHub Trending Daily 榜单（全语言总榜 + Python AI 专区 + TypeScript 专区）；
 * 2. 深度解析：结构化提取仓库名、Owner、描述、主语言、今日 Star 增量、总 Star、Fork 数；
 * 3. 容灾回退（Dual Resilience）：若 Trending 页面受阻，自动降级启用 GitHub Search API；
 * 4. 支持独立命令行运行调试与被 fetch-feeds.js 作为模块调用。
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const SOURCES_FILE = join(ROOT_DIR, 'config', 'sources.json');

// HTML 实体解码与格式清理
function decodeHtmlEntities(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// 单个 HTML 块解析
function parseTrendingArticle(articleHtml, channelName = '') {
  try {
    // 1. 仓库名与 Owner
    const repoMatch = articleHtml.match(/href="\/([a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+)"/);
    if (!repoMatch) return null;
    const repo = repoMatch[1].trim();
    if (
      repo.startsWith('login') ||
      repo.startsWith('signup') ||
      repo.startsWith('features') ||
      repo.startsWith('sponsors') ||
      repo.startsWith('topics') ||
      repo.startsWith('collections') ||
      repo.startsWith('trending')
    ) {
      return null;
    }

    const parts = repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [owner, name] = parts;
    if (owner === 'sponsors' || owner === 'settings' || owner === 'orgs') return null;

    // 2. 描述
    const descMatch = articleHtml.match(/<p class="col-9[^>]*>([\s\S]*?)<\/p>/);
    const rawDesc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const description = decodeHtmlEntities(rawDesc);

    // 3. 编程语言与颜色
    const langMatch = articleHtml.match(/itemprop="programmingLanguage">([^<]+)<\/span>/);
    const language = langMatch ? langMatch[1].trim() : 'Unknown';

    const colorMatch = articleHtml.match(/class="repo-language-color"[^>]*style="background-color:\s*([^"]+)"/);
    const languageColor = colorMatch ? colorMatch[1].trim() : '#e0e0e0';

    // 4. 今日/周期 Star 增量
    const starsTodayMatch = articleHtml.match(/([\d,]+)\s+stars\s+(?:today|this\s+week)/i);
    const starsToday = starsTodayMatch ? parseInt(starsTodayMatch[1].replace(/,/g, ''), 10) : 0;

    // 5. 总 Star 数与 Fork 数
    const totalStarsMatch = articleHtml.match(/href="\/[^"]+\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)\s*<\/a>/);
    const totalStars = totalStarsMatch ? parseInt(totalStarsMatch[1].replace(/,/g, ''), 10) : 0;

    const forksMatch = articleHtml.match(/href="\/[^"]+\/forks"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)\s*<\/a>/);
    const forks = forksMatch ? parseInt(forksMatch[1].replace(/,/g, ''), 10) : 0;

    return {
      repo,
      owner,
      name,
      url: `https://github.com/${repo}`,
      description,
      language,
      languageColor,
      starsToday,
      totalStars,
      forks,
      channel: channelName || 'GitHub Trending'
    };
  } catch (err) {
    return null;
  }
}

// 抓取指定 Trending 页面
async function fetchTrendingPage(path = '', channelName = '') {
  const url = path ? `https://github.com/trending/${path}?since=daily` : `https://github.com/trending?since=daily`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
      console.warn(`[GitHub Trending] 请求 ${url} 返回状态码: ${res.status}`);
      return [];
    }

    const html = await res.text();
    const articles = html.split('<article class="Box-row">').slice(1);
    const list = [];

    for (const art of articles) {
      const parsed = parseTrendingArticle(art, channelName);
      if (parsed && parsed.repo) {
        list.push(parsed);
      }
    }

    return list;
  } catch (err) {
    console.warn(`[GitHub Trending] 抓取 ${url} 失败:`, err.message);
    return [];
  }
}

// 备用容灾方案：通过 GitHub Search API 查找近 7 天创建或近期更新的高星爆发项目
async function fetchViaSearchApi(limit = 8) {
  try {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
      'User-Agent': 'AI-Daily-News-Trending-Fetcher',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const query = encodeURIComponent(`created:>${sevenDaysAgo} stars:>50`);
    const apiUrl = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${limit}`;

    const res = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];

    const data = await res.json();
    return (data.items || []).map(item => ({
      repo: item.full_name,
      owner: item.owner?.login || '',
      name: item.name,
      url: item.html_url,
      description: item.description || '',
      language: item.language || 'Unknown',
      languageColor: '#e0e0e0',
      starsToday: Math.round((item.stargazers_count || 0) / 7),
      totalStars: item.stargazers_count || 0,
      forks: item.forks_count || 0,
      channel: 'GitHub Search API 容灾推荐'
    }));
  } catch (err) {
    console.warn(`[GitHub Search API] 备用接口异常:`, err.message);
    return [];
  }
}

/**
 * 核心导出函数：定时抓取热门开源项目
 */
export async function fetchGithubTrending(options = {}) {
  let sources = {};
  try {
    if (existsSync(SOURCES_FILE)) {
      sources = JSON.parse(await readFile(SOURCES_FILE, 'utf-8'));
    }
  } catch {}

  const config = sources.github_trending || {};
  if (config.enabled === false && !options.force) {
    console.log(`[GitHub Trending] 根据配置，已跳过热门开源项目抓取。`);
    return [];
  }

  const channels = options.channels || config.channels || [
    { name: '全语言热门', path: '' },
    { name: 'Python AI 专区', path: 'python' }
  ];
  const limit = options.limit || config.limit || 8;
  const minStarsToday = options.minStarsToday ?? config.minStarsToday ?? 30;

  console.log(`[GitHub Trending] 正在拉取热门开源项目 (监听 ${channels.length} 个专区，限制 Top ${limit})...`);

  // 并发拉取各专区
  const channelResults = await Promise.all(
    channels.map(ch => fetchTrendingPage(ch.path, ch.name))
  );

  // 合并并去重
  const projectMap = new Map();
  for (const list of channelResults) {
    for (const p of list) {
      if (!projectMap.has(p.repo)) {
        projectMap.set(p.repo, p);
      } else {
        // 若重复出现，合并专区标签与取最高 starsToday
        const existing = projectMap.get(p.repo);
        if (p.starsToday > existing.starsToday) {
          existing.starsToday = p.starsToday;
        }
        if (!existing.channel.includes(p.channel)) {
          existing.channel += ` / ${p.channel}`;
        }
      }
    }
  }

  let projects = Array.from(projectMap.values());

  // 若 Trending 抓取失败或数量严重不足，触发 GitHub Search API 备用容灾
  if (projects.length === 0) {
    console.warn(`[GitHub Trending] 官方 Trending 页面无返回，自动启用 GitHub Search API 备选方案...`);
    projects = await fetchViaSearchApi(limit);
  }

  // 按今日增长速率与总影响力综合加权排序
  projects.sort((a, b) => {
    // 综合热度算法：今日 Star 增量权重更高
    const scoreA = (a.starsToday || 0) * 3 + Math.min(1000, (a.totalStars || 0) * 0.05);
    const scoreB = (b.starsToday || 0) * 3 + Math.min(1000, (b.totalStars || 0) * 0.05);
    return scoreB - scoreA;
  });

  // 过滤低门槛项目并截取 Top N
  const filtered = projects
    .filter(p => (p.starsToday >= minStarsToday || p.totalStars >= 500))
    .slice(0, limit);

  console.log(`[GitHub Trending] 成功捕获并精选 ${filtered.length} 个热门开源项目：`);
  filtered.forEach((p, idx) => {
    console.log(`  ${idx + 1}. [${p.language}] ${p.repo} (+${p.starsToday} today, total: ${p.totalStars})`);
  });

  return filtered;
}

// 命令行直接执行入口
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchGithubTrending({ force: true }).then(results => {
    console.log(`\n抓取完成，共获得 ${results.length} 个开源项目。`);
  }).catch(err => {
    console.error('抓取失败:', err);
    process.exit(1);
  });
}
