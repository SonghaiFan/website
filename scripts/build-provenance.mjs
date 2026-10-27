import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from './config.mjs';
const target = process.env.TARGET;
if (!['home', 'blog'].includes(target)) throw new Error('Expected TARGET=home|blog');
const directory = target === 'home' ? 'apps/home/.site-dist' : 'apps/blog/.stage/docs/.vitepress/dist';
const webSha = process.env.WEB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(root, directory, 'build.json'), JSON.stringify({ target, webSha, contentSha: target === 'blog' ? process.env.CONTENT_SHA : null, builtAt: new Date().toISOString() }) + '\n');
