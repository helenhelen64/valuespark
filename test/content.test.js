import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("思考方式保留原始完整内容", () => {
  assert.match(appSource, /不是更快，而是更深。/);
  assert.match(appSource, /这个过程不是 AI 替你想，而是和你一起把思考「摊开」来看。/);
  assert.match(appSource, /为什么这种方式有效？/);
  assert.match(appSource, /可追溯的洞见/);
});

test("五个真实案例保留完整双段叙事", () => {
  const people = ["李明", "陈雨欣", "王思远", "张薇", "林浩"];
  for (const person of people) {
    assert.match(appSource, new RegExp(person));
  }

  assert.match(appSource, /帮用户每周节省 4-6 小时手动工作/);
  assert.match(appSource, /原本计划的 14 个功能砍到 6 个/);
  assert.match(appSource, /两个月后完成种子轮/);
  assert.match(appSource, /自己真正害怕的不是转型，而是“失去安全感”/);
});

test("思考页提供完整站内导航", () => {
  assert.match(appSource, /class="thread-nav"/);
  for (const route of ["#/", "#/library", "#/space", "#/approach", "#/cases", "#/about"]) {
    assert.match(appSource, new RegExp(`data-route="${route.replace("/", "\\/")}"`));
  }
});

test("桌面端对话与思考路径使用独立滚动区域", () => {
  assert.match(stylesSource, /\.thread-page\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  assert.match(stylesSource, /\.conversation-panel\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(stylesSource, /\.thread-dialogue\s*\{[^}]*overscroll-behavior:\s*contain;/s);
  assert.match(stylesSource, /\.reasoning-cards\s*\{[^}]*overflow:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
});
