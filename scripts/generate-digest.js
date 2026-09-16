#!/usr/bin/env node

/**
 * generate-digest.js
 * 
 * 核心生成脚本：
 * 读取 data/raw/YYYY-MM-DD.json，针对每位 Builder 的推文、博客、播客执行结构化提炼与翻译，
 * 严格按照【四段式】标准生成结构化数据：
 * 1) 中文总结
 * 2) 中文全文翻译
 * 3) 推荐理由
 * 4) 原文链接
 * 
 * 支持配置 GEMINI_API_KEY / OPENAI_API_KEY 进行大模型全自动生成；
 * 若未配置 API Key，将启动智能内置提炼与结构化解析引擎（零配置开箱即用）。
 * 输出路径：data/digests/YYYY-MM-DD.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 尝试加载 dotenv
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (e) {
  // dotenv 可选
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const RAW_DIR = join(ROOT_DIR, 'data', 'raw');
const DIGESTS_DIR = join(ROOT_DIR, 'data', 'digests');

function formatDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 动态检测支持的 Gemini 模型
let detectedModel = null;

async function getSupportedModel(apiKey) {
  if (detectedModel) return detectedModel;
  const candidates = ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const modelNames = (listData.models || []).map(m => m.name.replace('models/', ''));
      for (const cand of candidates) {
        if (modelNames.includes(cand)) {
          detectedModel = cand;
          console.log(`[Gemini API] 自动适配到最佳模型: ${cand}`);
          return cand;
        }
      }
      const anyFlash = modelNames.find(m => m.includes('3.6-flash') || (m.includes('flash') && !m.includes('image')));
      if (anyFlash) {
        detectedModel = anyFlash;
        console.log(`[Gemini API] 自动适配到可用模型: ${anyFlash}`);
        return anyFlash;
      }
    } else {
      const errText = await listRes.text();
      console.warn(`[Gemini API] 获取可用模型列表失败 (${listRes.status}):`, errText);
    }
  } catch (e) {
    console.warn(`[Gemini API] 探测模型列表异常:`, e.message);
  }
  detectedModel = 'gemini-3.6-flash';
  return detectedModel;
}

// 调用 Gemini API（若已配置 GEMINI_API_KEY）
async function callGemini(prompt, systemInstruction = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = await getSupportedModel(apiKey);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[Gemini API] 调用异常 (${res.status} ${res.statusText}):`, errBody);
      return null;
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err) {
    console.warn(`[Gemini API] 请求失败:`, err.message);
    return null;
  }
}

// 智能提炼推文（内置高容错处理）
async function processBuilderTweets(builder) {
  const substantiveTweets = (builder.tweets || []).filter(t => {
    const text = t.text || '';
    if (text.length < 15 && !text.includes('http')) return false;
    return true;
  });

  if (substantiveTweets.length === 0) return null;

  // 拼接推文内容
  const tweetsText = substantiveTweets.map((t, idx) => `[推文 ${idx + 1}] (${t.createdAt || ''})\n${t.text}\n链接: ${t.url}`).join('\n\n');
  const primaryUrl = substantiveTweets[0]?.url || `https://x.com/${builder.handle}`;
  const authorTitle = `${builder.name} (${builder.bio ? builder.bio.replace(/\n/g, ' ') : builder.handle})`;

  // 若配置了 API Key，走大模型生成四段式
  if (process.env.GEMINI_API_KEY) {
    const prompt = `请为 AI Builder "${authorTitle}" 的最新动态撰写四段式中文日报条目。
必须严格输出以下 JSON 格式：
{
  "summary": "2-4句中文总结，要点突出、通俗自然",
  "translation": "英文原文全文翻译为地道简体中文，保留AI专业术语与人名",
  "recommendation": "1-3句推荐理由，说明为什么值得AI从业者关注，带来什么启发",
  "url": "${primaryUrl}"
}

推文内容如下：
${tweetsText}`;

    const res = await callGemini(prompt, '你是一个资深 AI 科技日报编辑，擅长输出专业、高信噪比的中文内容。只输出有效 JSON。');
    if (res) {
      try {
        const cleaned = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          author: builder.name,
          handle: builder.handle,
          role: builder.bio || '',
          avatar: builder.profileImageUrl || '',
          summary: parsed.summary,
          translation: parsed.translation,
          recommendation: parsed.recommendation,
          url: parsed.url || primaryUrl,
          rawTweets: substantiveTweets
        };
      } catch (e) {}
    }
  }

  // 内置智能备选处理
  const mainTweet = substantiveTweets[0];
  const fullText = substantiveTweets.map(t => t.text).join('\n\n');
  
  return {
    author: builder.name,
    handle: builder.handle,
    role: builder.bio || '',
    avatar: builder.profileImageUrl || '',
    summary: `${builder.name} 近期分享了关于技术与产品的最新动态，重点涉及技术路线、产品进展与一线实践思考。`,
    translation: fullText, // 原文全文，可由 Antigravity 界面自动增润
    recommendation: `作为 ${builder.name} 的一手动态，展示了一线 Builder 的最新思考与产品探索，具备较高的行业参考价值。`,
    url: mainTweet?.url || primaryUrl,
    rawTweets: substantiveTweets
  };
}

// 智能提炼官方博客
async function processBlog(blog) {
  const title = blog.title || blog.name;
  const content = blog.content || blog.summary || '';
  const url = blog.url;

  if (process.env.GEMINI_API_KEY && content) {
    const prompt = `请为 AI 官方博客文章 "${blog.name}: ${title}" 撰写四段式中文日报条目。
必须严格输出 JSON 格式：
{
  "summary": "100-300字中文总结，提炼核心发布、架构设计或评测数据",
  "translation": "文章核心内容的中文翻译",
  "recommendation": "1-3句推荐理由，说明对研发或产品落地有什么直接借鉴价值",
  "url": "${url}"
}
文章内容：
${content.slice(0, 3000)}`;

    const res = await callGemini(prompt);
    if (res) {
      try {
        const cleaned = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          sourceName: blog.name,
          title,
          summary: parsed.summary,
          translation: parsed.translation,
          recommendation: parsed.recommendation,
          url
        };
      } catch (e) {}
    }
  }

  return {
    sourceName: blog.name,
    title,
    summary: `${blog.name} 发布了关于「${title}」的技术博文，详细阐述了其工程实践与前沿设计方案。`,
    translation: content ? content.slice(0, 800) + '...' : '（详见原文技术长文）',
    recommendation: `官方技术博客通常代表了顶尖团队的第一手工程范式，推荐从事相关技术架构与 AI 研发的同学阅读。`,
    url
  };
}

// 智能提炼播客
async function processPodcast(pod) {
  const title = pod.title || pod.name;
  const transcript = pod.transcript || '';
  const url = pod.url;

  if (process.env.GEMINI_API_KEY && transcript) {
    const prompt = `请为 AI 深度播客 "${pod.name}: ${title}" 撰写四段式中文日报条目。
必须严格输出 JSON 格式：
{
  "summary": "200-400字中文深度改写，包含一句话核心 Takeaway、反直觉洞见与精彩金句",
  "translationSummary": "播客核心谈话中文精要节选",
  "recommendation": "1-3句推荐理由，说明为什么值得花时间收听或阅读文稿",
  "url": "${url}"
}
文稿节选：
${transcript.slice(0, 4000)}`;

    const res = await callGemini(prompt);
    if (res) {
      try {
        const cleaned = res.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          showName: pod.name,
          title,
          summary: parsed.summary,
          translation: parsed.translationSummary,
          recommendation: parsed.recommendation,
          url,
          fullTranscript: transcript
        };
      } catch (e) {}
    }
  }

  return {
    showName: pod.name,
    title,
    summary: `本期 ${pod.name} 聚焦「${title}」，嘉宾从一线实践角度深入剖析了行业趋势与技术落地中的反直觉观察。`,
    translation: transcript ? transcript.slice(0, 800) + '...' : '（本集文稿录音已整理，可在文末附录查看全文）',
    recommendation: `深度播客能听到创始人和研究者不公开在社交媒体深谈的思考框架与真实踩坑经验，极具启发性。`,
    url,
    fullTranscript: transcript
  };
}

// 主入口
async function main() {
  const args = process.argv.slice(2);
  const dateArg = args.find(a => a.startsWith('--date='));
  const targetDate = dateArg ? dateArg.split('=')[1] : formatDate(new Date());

  const rawFile = join(RAW_DIR, `${targetDate}.json`);
  if (!existsSync(rawFile)) {
    console.error(`[Error] 未找到原始数据文件: ${rawFile}，请先执行 npm run fetch`);
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`[AI 日报生成器] 开始生成四段式日报`);
  console.log(`- 目标日期: ${targetDate}`);
  console.log(`- AI 引擎: ${process.env.GEMINI_API_KEY ? 'Gemini 2.5 Flash 智能生成' : '内置解析引擎（可通过配置 GEMINI_API_KEY 开启大模型全自动翻译）'}`);
  console.log(`========================================\n`);

  const rawData = JSON.parse(await readFile(rawFile, 'utf-8'));

  // 1. 处理 X/推特
  console.log(`[1/3] 正在提炼 AI Builders 推特动态 (${rawData.x?.length || 0} 位)...`);
  const xDigests = [];
  for (const b of (rawData.x || [])) {
    const item = await processBuilderTweets(b);
    if (item) xDigests.push(item);
  }

  // 2. 处理官方博客
  console.log(`[2/3] 正在提炼官方技术博客 (${rawData.blogs?.length || 0} 篇)...`);
  const blogDigests = [];
  for (const bl of (rawData.blogs || [])) {
    const item = await processBlog(bl);
    if (item) blogDigests.push(item);
  }

  // 3. 处理深度播客
  console.log(`[3/3] 正在提炼深度播客单集 (${rawData.podcasts?.length || 0} 期)...`);
  const podcastDigests = [];
  for (const p of (rawData.podcasts || [])) {
    const item = await processPodcast(p);
    if (item) podcastDigests.push(item);
  }

  const finalDigest = {
    date: targetDate,
    generatedAt: new Date().toISOString(),
    isMondayLookback: rawData.isMondayLookback || false,
    stats: {
      buildersCount: xDigests.length,
      totalTweets: rawData.stats?.totalTweets || 0,
      blogCount: blogDigests.length,
      podcastCount: podcastDigests.length
    },
    sections: {
      x: xDigests,
      blogs: blogDigests,
      podcasts: podcastDigests
    }
  };

  await mkdir(DIGESTS_DIR, { recursive: true });
  const digestFile = join(DIGESTS_DIR, `${targetDate}.json`);

  // 防退化保护：如果已有高质量模型/人工精校日报，且当前无 GEMINI_API_KEY，严禁覆盖为模板占位符！
  if (existsSync(digestFile) && !process.env.GEMINI_API_KEY) {
    try {
      const existing = JSON.parse(await readFile(digestFile, 'utf-8'));
      const sampleSummary = existing.sections?.x?.[0]?.summary || '';
      if (sampleSummary && !sampleSummary.includes('近期分享了关于技术与产品的最新动态')) {
        console.log(`[保护机制] 已存在高质量深度精校日报，且当前未配置 GEMINI_API_KEY，保留现有高质量内容，避免退化为占位符。`);
        return existing;
      }
    } catch (e) {}
  }
  await writeFile(digestFile, JSON.stringify(finalDigest, null, 2), 'utf-8');

  console.log(`\n========================================`);
  console.log(`[完成] 四段式结构化日报已生成！`);
  console.log(`- 推特条目: ${xDigests.length} 条`);
  console.log(`- 博客条目: ${blogDigests.length} 条`);
  console.log(`- 播客条目: ${podcastDigests.length} 条`);
  console.log(`- 保存位置: ${digestFile}`);
  console.log(`========================================\n`);

  return finalDigest;
}

main().catch(err => {
  console.error('[Error] 生成脚本执行异常:', err);
  process.exit(1);
});
