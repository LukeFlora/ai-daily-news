#!/usr/bin/env node

/**
 * run-daily.js
 * 
 * 每日工作流一键执行总入口（带开机防漏跑与幂等性检查）：
 * 1. 检查今日是否已成功生成过日报（避免重复消耗）：
 *    - 若已生成且未传 --force，则自动跳过；
 *    - 若今日尚未生成（例如周一刚开机、或因休眠错过了早 09:00 定时），自动立即补跑！
 * 2. 串联执行：fetch-feeds.js -> generate-digest.js -> build-site.js
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const DIGESTS_DIR = join(ROOT_DIR, 'data', 'digests');

function formatDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function runCommand(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = join(ROOT_DIR, 'scripts', scriptName);
    console.log(`\n▶️ 正在运行: node ${scriptName} ${args.join(' ')}`);
    
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`脚本 ${scriptName} 退出异常，退出码: ${code}`));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isForce = args.includes('--force');
  const todayStr = formatDate(new Date());
  const todayDigestFile = join(DIGESTS_DIR, `${todayStr}.json`);

  // 幂等性防护：如果今日已经生成过，且未指定 --force，则跳过
  if (existsSync(todayDigestFile) && !isForce && !args.includes('--force-weekend')) {
    console.log(`\n======================================================`);
    console.log(`ℹ️ [提示] 今日 (${todayStr}) 的 AI Builders 日报已存在且为最新状态。`);
    console.log(`   如需重新采集并强制覆盖，请执行：npm run daily -- --force`);
    console.log(`======================================================\n`);
    process.exit(0);
  }

  const startTime = Date.now();
  console.log(`\n======================================================`);
  console.log(`🤖 [AI Builders 日报自动化工作流] 开始执行`);
  console.log(`   目标日期: ${todayStr} | 运行时间: ${new Date().toLocaleString()}`);
  console.log(`======================================================`);

  try {
    // 步骤 1: 抓取（自动感知周末断档，周一自动拉取周末 72 小时快照）
    await runCommand('fetch-feeds.js', args);

    // 步骤 2: 结构化四段式摘要与翻译生成
    await runCommand('generate-digest.js', args);

    // 步骤 3: 静态网站 HTML 编译与归档刷新
    await runCommand('build-site.js', args);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 [执行完成] 今日 AI Builders 日报与 HTML 网站编译成功！(耗时 ${elapsed}s)`);
    console.log(`👉 运行 npm run preview 查看最新网站效果。`);
  } catch (err) {
    console.error(`\n❌ [工作流终止] 执行出错:`, err.message);
    process.exit(1);
  }
}

main();
