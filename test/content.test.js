import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");

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
