const canvas = document.getElementById("world");
const ctx = canvas ? canvas.getContext("2d") : null;
const cardEl = document.getElementById("card");
const sayEl = document.getElementById("say");

const SAMPLES = {
  ch1: "环境是客户的工单队列。智能体能做三件事：读一条工单、查知识库、给出下一步处理建议。工单被标成已处理，并且建议能对应到依据，就算完成。",
  ch2: "步骤多，走错会把工单处理错，所以先规划再执行，做完一轮再决定要不要改计划。",
  ch3: "输入是工单，模型判断下一步，上下文放依据，状态记住做到哪，输出是带依据的结构化建议。",
  ch4: "可以查知识库、可以草拟回复。查资料直接做。发送给客户必须先经过人确认。",
  ch5: "接收角色收下工单，执行角色查资料并草拟，检查角色核对依据。人在发送前介入。",
  ch6: "不许承诺赔偿，不许读工单以外的数据，不许无人确认就对外发送。没见过的工单也能对上依据，才算可靠。",
  ch7: "系统处理客户工单。用了任务环境、工具边界和评测。新工单给出有依据的建议，对外发送必须等人确认，就算交付。",
};

function place(id, title, region, x, y, z, extra = {}) {
  return { id, title, region, x, y, z, lit: false, ...extra };
}

const nodes = [
  place("ch1", "概念与问题建模", "agent", 0, -1.4, 0, { lane: "看见", outcome: "任务环境说明书" }),
  place("ch2", "架构与推理范式", "agent", 0, -0.93, 0, { lane: "看见", outcome: "范式选择报告", requires: ["ch1"] }),
  place("ch3", "Agent 系统构成", "agent", 0, -0.46, 0, { lane: "搭起来", outcome: "最小 Agent", requires: ["ch2"] }),
  place("ch4", "工具、知识与记忆", "agent", 0, 0, 0, { lane: "搭起来", outcome: "受控单 Agent", requires: ["ch3"] }),
  place("ch5", "工作流与多智能体", "agent", 0, 0.46, 0, { lane: "训出来", outcome: "工作流", requires: ["ch4"] }),
  place("ch6", "评测、安全与生产化", "agent", 0, 0.93, 0, { lane: "训出来", outcome: "可信系统", requires: ["ch5"] }),
  place("ch7", "综合项目", "agent", 0, 1.4, 0, { lane: "交付", outcome: "综合项目", target: true, requires: ["ch6"] }),
  place("react", "ReAct", "agent", 0.78, -1.1, 0, { requires: ["ch2"] }),
  place("plan", "规划", "agent", 0.78, -0.76, 0, { requires: ["ch2"] }),
  place("ctx", "上下文", "agent", -0.78, -0.46, 0, { requires: ["ch3"] }),
  place("state", "状态", "agent", -0.78, -0.12, 0, { requires: ["ch3"] }),
  place("tool", "工具调用", "agent", 0.82, -0.16, 0, { requires: ["ch4"] }),
  place("rag", "检索", "agent", 0.82, 0.16, 0, { requires: ["ch4"] }),
  place("mem", "记忆", "agent", 0.82, 0.48, 0, { requires: ["ch4"] }),
  place("route", "路由", "agent", -0.78, 0.46, 0, { requires: ["ch5"] }),
  place("guard", "边界", "agent", 0.82, 0.86, 0, { requires: ["ch6"] }),
  place("perm", "权限", "agent", 0.82, 1.18, 0, { requires: ["ch6"] }),
  place("cnn", "卷积", "dl", -1.95, -1.15, 0),
  place("pool", "池化", "dl", -1.95, -0.7, 0, { requires: ["cnn"] }),
  place("loss", "损失", "dl", -1.95, -0.25, 0, { requires: ["pool"] }),
  place("bp", "反向传播", "dl", -1.95, 0.2, 0, { requires: ["loss"] }),
  place("attn", "注意力", "dl", -1.95, 0.65, 0, { requires: ["bp"] }),
  place("tf", "Transformer", "dl", -1.95, 1.1, 0, { requires: ["attn"] }),
  place("bert", "预训练", "dl", -1.35, 1.1, 0, { requires: ["tf"] }),
  place("gan", "GAN", "dl", -2.55, -0.7, 0, { requires: ["cnn"] }),
  place("seq", "序列", "dl", -2.55, 0.2, 0, { requires: ["loss"] }),
  place("supply", "供应协同", "biz", 1.85, -1.05, 0),
  place("order", "订单", "biz", 1.3, -0.5, 0, { requires: ["supply"] }),
  place("stock", "库存", "biz", 1.85, -0.5, 0, { requires: ["supply"] }),
  place("local", "本地化", "biz", 2.4, -0.5, 0, { requires: ["supply"] }),
  place("vendor", "供应商准入", "biz", 1.85, 0.1, 0, { requires: ["stock"] }),
  place("switch", "基地切换", "biz", 1.85, 0.65, 0, { requires: ["vendor"] }),
  place("deliver", "交付", "biz", 2.45, 0.65, 0, { requires: ["switch"] }),
];

const edges = [];
nodes.forEach((n) => (n.requires || []).forEach((r) => edges.push([r, n.id])));

const regionColor = { agent: "#3f7394", dl: "#3d7a5a", biz: "#6d5b8c" };
const regionWash = { agent: "rgba(63,115,148,0.08)", dl: "rgba(61,122,90,0.08)", biz: "rgba(109,91,140,0.08)" };
const byId = (id) => nodes.find((n) => n.id === id);

let rotY = 0.5;
let rotX = 0.25;
let zoom = 430;
let auto = false;
const embedView = new URLSearchParams(location.search).get("view");
let view = ["world", "ability", "lane"].includes(embedView) ? embedView : "lane";
const embed = new URLSearchParams(location.search).get("embed") === "1";
const layout = new Map();
let focusIds = new Set();
let hoverId = null;
const projected = new Map();

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
if (canvas) {
  addEventListener("resize", resize);
  resize();
  if (embed) zoom = Math.max(260, Math.min(380, innerWidth * 0.52));
}

function rebuildLayout() {
  layout.clear();
  if (view === "world") {
    nodes.forEach((n) => layout.set(n.id, { x: n.x, y: n.y, z: n.z }));
    return;
  }
  const order = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7"];
  if (view === "ability") {
    order.forEach((id, i) => layout.set(id, { x: 0, y: 1.25 - i * 0.42, z: 0 }));
    const buckets = {};
    nodes.filter((n) => n.region === "agent" && !n.lane).forEach((n) => {
      const parent = (n.requires || [])[0];
      (buckets[parent] = buckets[parent] || []).push(n);
    });
    Object.entries(buckets).forEach(([pid, list]) => {
      const base = layout.get(pid);
      if (!base) return;
      list.forEach((n, i) => {
        const side = pid === "ch3" || pid === "ch5" ? -1 : 1;
        layout.set(n.id, {
          x: base.x + side * 0.82,
          y: base.y + (i - (list.length - 1) / 2) * 0.28,
          z: 0,
        });
      });
    });
    return;
  }
  const lanes = ["看见", "搭起来", "训出来", "交付"];
  const chapters = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7"];
  lanes.forEach((lane, col) => {
    const heads = chapters.filter((id) => byId(id).lane === lane);
    let y = -1.05;
    heads.forEach((id) => {
      const x = (col - 1.5) * 1.35;
      layout.set(id, { x, y, z: 0 });
      const kids = nodes.filter((s) => !s.lane && (s.requires || [])[0] === id);
      kids.forEach((n, i) => layout.set(n.id, { x: x + 0.42, y: y + 0.34 * (i + 1), z: 0 }));
      y += 0.4 * (kids.length + 1) + 0.22;
    });
  });
}

function project(n) {
  const pos = layout.get(n.id);
  if (!pos) return null;
  const use3d = view === "world";
  const ry = use3d ? rotY : 0;
  const rx = use3d ? rotX : 0;
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x1 = pos.x * cosY - pos.z * sinY;
  const z1 = pos.x * sinY + pos.z * cosY;
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y1 = pos.y * cosX - z1 * sinX;
  const z2 = pos.y * sinX + z1 * cosX;
  const p = zoom / (z2 + 3.4);
  return {
    x: innerWidth * 0.5 + x1 * p,
    y: (view === "world" ? innerHeight * 0.46 : embed ? innerHeight * 0.58 : innerHeight * 0.5) + y1 * p,
    r: Math.max(view === "world" ? 3.5 : 8, p * (view === "world" ? 0.055 : 0.07)),
    z: z2,
    a: Math.max(0.25, Math.min(1, (z2 + 1.6) / 2.4)),
  };
}

function draw() {
  try {
  const w = innerWidth;
  const h = innerHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = embed ? "#ffffff" : "#f4f0e6";
  ctx.fillRect(0, 0, w, h);
  if (auto) rotY += 0.0018;

  projected.clear();
  const pts = nodes.map((n) => ({ n, p: project(n) })).filter((item) => item.p);
  pts.forEach(({ n, p }) => projected.set(n.id, p));
  pts.sort((a, b) => a.p.z - b.p.z);

  if (view === "world") {
    ["agent", "dl", "biz"].forEach((region) => {
      const group = pts.filter(({ n }) => n.region === region);
      if (!group.length) return;
      const xs = group.map(({ p }) => p.x);
      const ys = group.map(({ p }) => p.y);
      const pad = 36;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      if (!embed) {
        ctx.fillStyle = regionWash[region];
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2, 28);
        ctx.fill();
      }
      ctx.fillStyle = "#6d6458";
      ctx.font = "13px 'Noto Serif SC', serif";
      ctx.fillText(region === "agent" ? "智能体" : region === "dl" ? "深度学习" : "经营能力", x + 14, y + 22);
    });
  } else if (view === "lane") {
    ["看见", "搭起来", "训出来", "交付"].forEach((lane) => {
      const group = pts.filter(({ n }) => n.lane === lane || ((byId((n.requires || [])[0] || "") || {}).lane === lane));
      if (!group.length) return;
      const xs = group.map(({ p }) => p.x);
      const ys = group.map(({ p }) => p.y);
      const pad = 28;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - 46;
      if (!embed) {
        ctx.fillStyle = "rgba(63,115,148,0.07)";
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - y + pad, 22);
        ctx.fill();
      }
      ctx.fillStyle = "#1c1915";
      ctx.font = "15px 'Noto Serif SC', serif";
      ctx.fillText(lane, x + 12, y + 24);
    });
  }

  ctx.lineWidth = 1.4;
  edges.forEach(([a, b]) => {
    const pa = projected.get(a);
    const pb = projected.get(b);
    if (!pa || !pb) return;
    const hot = focusIds.size === 0 || focusIds.has(a) || focusIds.has(b);
    ctx.strokeStyle = hot ? "rgba(55,45,32,0.38)" : "rgba(55,45,32,0.12)";
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  });

  const labels = [];
  pts.forEach(({ n, p }) => {
    const hot = focusIds.size === 0 || focusIds.has(n.id);
    const ready = n.id === readyId() && !n.lit;
    const locked = !n.lit && !ready;
    const onRoute = view === "ability" || view === "lane";
    const color = n.lit ? "#2f6f96" : n.target ? "#2f6b4f" : ready ? "#c46a32" : (onRoute ? "#c8c0b4" : regionColor[n.region]);
    const radius = (n.lane || !onRoute ? p.r * 1.25 : p.r * 0.85) * (n.id === hoverId ? 1.2 : 1);
    ctx.globalAlpha = hot ? 1 : 0.4;
    ctx.fillStyle = locked && onRoute ? "#f7f3ea" : color;
    ctx.strokeStyle = ready ? "#c46a32" : (n.lit ? "#2f6f96" : "#b7aea2");
    ctx.lineWidth = ready ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (n.lit) {
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.max(11, radius)}px 'Noto Serif SC', serif`;
      ctx.textAlign = "center";
      ctx.fillText("亮", p.x, p.y + radius * 0.35);
      ctx.textAlign = "left";
    }
    if (n.burst) {
      const t = (Date.now() - n.burst) / 800;
      if (t < 1) {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = "#c46a32";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 6 + t * 26, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (n.miss && Date.now() - n.miss < 500) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#8c3d32";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (ready) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#c46a32";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 7 + Math.sin(Date.now() / 280) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#8c4e28";
      ctx.font = "12px 'Noto Serif SC', serif";
      ctx.fillText("点这颗", p.x + radius + 8, p.y - radius - 8);
    }
    if (n.title && hot && radius > 6) {
      ctx.font = "12px 'Noto Serif SC', serif";
      const label = n.title;
      const box = { x: p.x + radius + 4, y: p.y - 6, w: ctx.measureText(label).width, h: 14 };
      const hitLabel = view !== "lane" && labels.some((b) => Math.abs(b.x - box.x) < 80 && Math.abs(b.y - box.y) < 16);
      if (!hitLabel) {
        labels.push(box);
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = "#1c1915";
        ctx.fillText(label, box.x, p.y + 4);
        if (view === "ability" && n.lane) {
          ctx.fillText(String(["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7"].indexOf(n.id) + 1), p.x - 4, p.y - radius - 4);
        }
      }
    }
    ctx.globalAlpha = 1;
  });
  placeCard();
  window.__frames = (window.__frames || 0) + 1;
  } catch (err) {
  window.__err = String(err && err.stack || err);
  }
}
function loop() {
  draw();
  requestAnimationFrame(loop);
}
if (canvas) {
  rebuildLayout();
  loop();
}

let drag = null;
if (canvas) canvas.addEventListener("pointerdown", (e) => {
  auto = false;
  drag = { x: e.clientX, y: e.clientY, rotY, rotX };
  canvas.classList.add("dragging");
});
if (canvas) {
  addEventListener("pointerup", () => {
    drag = null;
    canvas.classList.remove("dragging");
  });
  addEventListener("pointermove", (e) => {
    if (!drag) {
      hoverId = hit(e.clientX, e.clientY);
      const node = hoverId && byId(hoverId);
      canvas.style.cursor = node && (node.id === readyId() || node.lit) ? "pointer" : "grab";
      return;
    }
    rotY = drag.rotY + (e.clientX - drag.x) * 0.008;
    rotX = Math.max(-1.1, Math.min(1.1, drag.rotX + (e.clientY - drag.y) * 0.008));
  });
}
if (canvas) canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoom = Math.max(280, Math.min(900, zoom + (e.deltaY > 0 ? -24 : 24)));
}, { passive: false });
if (canvas) canvas.addEventListener("click", (e) => {
  if (Math.abs(e.clientX - (drag ? drag.x : e.clientX)) > 6) return;
  const id = hit(e.clientX, e.clientY);
  if (id) speakAbout(byId(id));
});

function hit(x, y) {
  let best = null;
  let bestD = 18;
  projected.forEach((p, id) => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < Math.max(bestD, p.r) && (!best || d < bestD)) {
      best = id;
      bestD = d;
    }
  });
  return best;
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function focusSet(ids) {
  focusIds = new Set(ids);
}
function agentIds() { return nodes.filter((n) => n.region === "agent" && n.lane).map((n) => n.id); }
function readyId() {
  return agentIds().find((id) => {
    const n = byId(id);
    return !n.lit && (n.requires || []).every((r) => byId(r).lit);
  });
}

function renderPath() {
  const el = document.getElementById("path");
  const next = readyId();
  const score = document.getElementById("score");
  if (score) score.textContent = `已点亮 ${nodes.filter((n) => n.lane && n.lit).length} / 7`;
  renderBoard();
  el.innerHTML = `<span class="path-label">学习路径</span>` + nodes.filter((n) => n.lane).map((n) => `
    <button type="button" class="${n.lit ? "lit" : ""} ${n.id === next ? "on" : ""}" data-node="${n.id}">
      ${esc(n.lane)}<small>${esc(n.title)}</small>
    </button>`).join("");
}

function laneHtml() {
  const lanes = ["看见", "搭起来", "训出来", "交付"];
  return lanes.map((lane) => {
    const items = nodes.filter((n) => n.lane === lane).map((n) => {
      const cls = `${n.lit ? "lit" : ""} ${n.target ? "target" : ""} ${n.id === readyId() ? "on" : ""}`;
      return `<button type="button" class="${cls}" data-node="${n.id}"><i></i>${esc(n.title)} · ${esc(n.outcome)}</button>`;
    }).join("");
    return `<div><b style="font-size:12px;color:#b7b0a6">${lane}</b><div class="lane">${items}</div></div>`;
  }).join("");
}

const SCENES = {
  ch1: {
    situation: "一张工单刚进来：「快递昨天没到，客户语气很冲。」这一步还没选模型。",
    ask: "你先定哪一件？",
    choices: [
      { t: "写清环境、能做的动作、怎样算完成", ok: true, back: "对。任务环境先定住，这一颗亮了。模型是后面的事。" },
      { t: "先挑一个更强的模型", ok: false, back: "模型换了，它身处的环境还是空的。这一颗先不亮。" },
      { t: "把回复写得客气一点", ok: false, back: "客气是说法，不是这一步要会的。先写清它在什么处境里行动。" },
    ],
  },
  ch2: {
    situation: "这单要查物流、核对订单，再决定赔不赔。查错一步就要多赔。",
    ask: "这一单怎么走？",
    choices: [
      { t: "先把步骤排好再动手", ok: true, back: "走错代价高，就先规划。这一颗亮了。" },
      { t: "想到一句回一句", ok: false, back: "边回边想也能动，但这单赔错了收不回来。这一颗先不亮。" },
      { t: "把提示词再写长一点", ok: false, back: "提示词变长，步骤还是没有。先决定先规划还是边做边改。" },
    ],
  },
  ch3: {
    situation: "任务它知道了，可每一轮都像第一次见面，上一句查过什么也忘了。",
    ask: "最小能跑的系统，先补哪一块？",
    choices: [
      { t: "补上输入、上下文、状态和结构化输出", ok: true, back: "五块齐了，它才记得做到哪。这一颗亮了。" },
      { t: "把提示词再写长一点", ok: false, back: "写长了还是没有状态。下一轮它还是不记得。" },
      { t: "再开一个聊天窗口", ok: false, back: "窗口多一个，系统还是那一块没补上。" },
    ],
  },
  ch4: {
    situation: "它查完知识库，准备直接把「我们赔偿一百」发给客户。",
    ask: "哪一下必须经过你？",
    choices: [
      { t: "查资料可以直接做，发给客户必须你确认", ok: true, back: "边界写清了。查是它的，发出去是你的。这一颗亮了。" },
      { t: "让它自己发，省得你盯着", ok: false, back: "这一下省了，赔偿就出去了。先不点亮。" },
      { t: "把知识库整本贴进提示词", ok: false, back: "资料更多，发出去的那一下还是没人看。" },
    ],
  },
  ch5: {
    situation: "同一个人又查、又写、又自己说没问题，已经忙乱了。",
    ask: "要不要拆开？",
    choices: [
      { t: "拆成接收、执行、检查，你在发送前介入", ok: true, back: "拆开是为了有人检查，不是为了多几个角色。这一颗亮了。" },
      { t: "再复制三个一样的智能体", ok: false, back: "三个一样的人，还是没有人专门检查。" },
      { t: "把检查删掉，更快", ok: false, back: "更快，但没人看它发得出去什么。先不点亮。" },
    ],
  },
  ch6: {
    situation: "演示用的工单都过了。新来的一单，它开始承诺赔偿。",
    ask: "怎样才算这系统可靠？",
    choices: [
      { t: "写清不许做的事，并用没见过的工单来判", ok: true, back: "边界加上没见过的工单，才算会了。这一颗亮了。" },
      { t: "把演示再跑一遍就算通过", ok: false, back: "演示再跑一遍，新工单还是会乱承诺。" },
      { t: "先上线，边界以后再补", ok: false, back: "上线之后再补，客户已经收到那句赔偿了。" },
    ],
  },
  ch7: {
    situation: "前面几次判断都留在星图上。现在要交一个能接新工单的系统。",
    ask: "这一次交什么？",
    choices: [
      { t: "用任务环境、工具边界和评测，接成一个系统", ok: true, back: "系统接上了。综合项目这一颗亮了，这是这次要交付的。" },
      { t: "再写一遍智能体的定义", ok: false, back: "定义又写了一遍，还是没有一个能接工单的系统。" },
      { t: "做一张结构图发到群里", ok: false, back: "图发出去了，新工单来了还是没人接。" },
    ],
  },
};

let activeId = null;
let anchorId = null;
let feedback = "";

function choiceButtons(n) {
  return SCENES[n.id].choices.map((c, i) =>
    `<button type="button" data-pick="${i}" data-node="${n.id}">${esc(c.t)}</button>`
  ).join("");
}

function placeCard() {
  if (!cardEl || cardEl.hidden || cardEl.classList.contains("center")) return;
  const p = anchorId && projected.get(anchorId);
  if (!p) {
    cardEl.style.left = "auto";
    cardEl.style.right = "24px";
    cardEl.style.top = "88px";
    cardEl.style.transform = "none";
    return;
  }
  const w = cardEl.offsetWidth || 360;
  const h = cardEl.offsetHeight || 260;
  let x = p.x + (p.r || 8) + 16;
  let y = p.y - 20;
  if (x + w > innerWidth - 16) x = p.x - w - (p.r || 8) - 16;
  x = Math.max(16, x);
  y = Math.max(16, Math.min(y, innerHeight - 168 - h));
  cardEl.style.transform = `translate(${x}px, ${y}px)`;
}

function talentMarkup(n) {
  const ready = n.id === readyId() && !n.lit;
  const kids = nodes.filter((s) => !s.lane && (s.requires || [])[0] === n.id);
  const cls = ["talent", n.lit ? "lit" : "", ready ? "ready" : "", !n.lit && !ready ? "locked" : "", n.target ? "target" : ""].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" data-node="${n.id}">
    <i>${n.lit ? "亮" : ready ? "点" : ""}</i>
    <b>${esc(n.title)}</b>
    ${kids.length ? `<small>${kids.map((k) => esc(k.title)).join(" · ")}</small>` : ""}
  </button>`;
}

function renderBoard() {
  const root = document.getElementById("board");
  if (!root) return;
  const lanes = [
    ["看见", ["ch1", "ch2"]],
    ["搭起来", ["ch3", "ch4"]],
    ["训出来", ["ch5", "ch6"]],
    ["交付", ["ch7"]],
  ];
  const order = ["ch7", "ch6", "ch5", "ch4", "ch3", "ch2", "ch1"];
  const dlNames = nodes.filter((n) => n.region === "dl").slice(0, 4).map((n) => n.title).join("、");
  const bizNames = nodes.filter((n) => n.region === "biz").slice(0, 3).map((n) => n.title).join("、");
  root.innerHTML = `
    <section class="world">
      <h2>知识世界</h2>
      <div class="regions">
        <div class="region dim"><b>深度学习</b><em>${esc(dlNames)}</em></div>
        <div class="region here">
          <b>智能体 · 你在这块</b>
          <div class="world-nodes">${agentIds().map((id) => {
            const n = byId(id);
            const ready = n.id === readyId() && !n.lit;
            return `<button type="button" class="dot ${n.lit ? "on" : ""} ${ready ? "ready" : ""}" data-node="${n.id}">${esc(n.title)}</button>`;
          }).join("")}</div>
        </div>
        <div class="region dim"><b>经营能力</b><em>${esc(bizNames)}</em></div>
      </div>
    </section>
    <section class="play">
      <div class="tree">
        <h2>技能树</h2>
        <p class="hint">从下往上点。铜圈是现在这一手。</p>
        <div class="trunk">${order.map((id) => talentMarkup(byId(id))).join("")}</div>
      </div>
      <div class="floor">
        <h2>课程泳道</h2>
        <p class="hint">同一批点，按篇章放进四列。</p>
        ${lanes.map(([name, ids]) => `
          <section class="lane-col ${ids.some((id) => byId(id).lit) ? "has" : ""}">
            <header>${esc(name)}</header>
            ${ids.map((id) => {
              const n = byId(id);
              const ready = n.id === readyId() && !n.lit;
              return `<button type="button" class="slot ${n.lit ? "lit" : ""} ${ready ? "ready" : ""}" data-node="${n.id}">${esc(n.title)}</button>`;
            }).join("")}
          </section>`).join("")}
      </div>
    </section>`;
}

function renderLink(n) {
  const el = document.getElementById("link");
  if (!el) return;
  if (!n) {
    el.textContent = "同一颗：还没点。点亮之后，技能树、泳道、知识世界会一起变。";
    return;
  }
  const step = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7"].indexOf(n.id) + 1;
  const state = n.lit ? "已点亮" : n.id === readyId() ? "现在能点" : "还锁着";
  el.textContent = `同一颗 · ${state}：技能树第 ${step} 层 · 泳道「${n.lane}」 · 知识世界「智能体」`;
}

let tourTimers = [];

function clearTour() {
  tourTimers.forEach(clearTimeout);
  tourTimers = [];
}

function tourLit(n, done) {
  clearTour();
  const stops = [
    ["ability", "技能树", "这一层刚刚点亮"],
    ["lane", "课程泳道", `「${n.lane}」这一格同时亮了`],
    ["world", "知识世界", "智能体这一团里的同一颗也亮了"],
  ];
  stops.forEach((stop, i) => {
    tourTimers.push(setTimeout(() => {
      const [next, name, line] = stop;
      setView(next);
      anchorId = n.id;
      focusSet([n.id]);
      cardEl.hidden = false;
      cardEl.className = "card";
      cardEl.innerHTML = `
        <p class="kicker">同一手 · ${i + 1} / 3</p>
        <h2>${esc(n.title)}</h2>
        <p class="sit">现在看的是${esc(name)}。${esc(line)}。</p>
        <p class="back">三个页签改的是同一颗，不是三套内容。</p>`;
      renderLink(n);
      placeCard();
      if (i === stops.length - 1) {
        tourTimers.push(setTimeout(done, 1200));
      }
    }, i * 1300));
  });
}

function showScene(n) {
  activeId = n.id;
  anchorId = n.id;
  cardEl.hidden = false;
  cardEl.className = "card";
  renderLink(n);
  const s = SCENES[n.id];
  const good = s.choices.find((c) => c.ok);
  sayEl.value = good.t;
  focusSet([n.id, ...(n.requires || [])]);
  cardEl.innerHTML = `
    <p class="kicker">${esc(n.title)}</p>
    ${feedback ? `<p class="back">${esc(feedback)}</p>` : ""}
    <p class="sit">${esc(s.situation)}</p>
    <p class="ask">${esc(s.ask)}</p>
    <div class="choices">${choiceButtons(n)}</div>`;
  placeCard();
}

function showReview(n) {
  anchorId = n.id;
  cardEl.hidden = false;
  cardEl.className = "card";
  focusSet([n.id]);
  cardEl.innerHTML = `
    <p class="kicker">已经点亮</p>
    <h2>${esc(n.title)}</h2>
    <p class="sit">${esc(n.decision || "")}</p>
    <p class="back">${esc(n.note || n.outcome || "")}</p>
    <button type="button" data-return>回到正在做的这一下</button>`;
  placeCard();
}

function showNote(title, body) {
  anchorId = null;
  cardEl.hidden = false;
  cardEl.className = "card center";
  cardEl.style.transform = "";
  focusSet([]);
  cardEl.innerHTML = `
    <p class="kicker">${esc(title)}</p>
    <p class="sit">${esc(body)}</p>
    <button type="button" data-return>回到正在做的这一下</button>`;
}

function returnToStep() {
  feedback = "";
  const next = byId(readyId());
  if (!next) {
    showNote("这条路", "七次判断都留在点亮的星上。点一颗可以回看。");
    return;
  }
  showScene(next);
}

function findChoice(text) {
  const id = activeId || readyId();
  const scene = id && SCENES[id];
  if (!scene) return null;
  return { id, choice: scene.choices.find((c) => text.includes(c.t.slice(0, 6))) };
}

const VIEW_NOTES = {
  world: "这三块是知识世界里的模块，不是课程本身。",
  ability: "技能树就是这次的能力路线。从下往上点，铜圈那颗现在能点。做对才点亮，旁边的小天赋跟着亮。",
  lane: "课程泳道：同一批节点按篇章排开。看见、搭起来、训出来、交付。",
};

function setView(next) {
  view = next;
  document.querySelectorAll("#lenses button").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.view === next);
  });
  const note = document.getElementById("viewnote");
  if (note) note.textContent = VIEW_NOTES[next];
  rebuildLayout();
}

function pathReply() {
  setView("ability");
  focusSet(agentIds());
  const next = byId(readyId());
  if (!next) {
    showNote("这条路", "七次判断都留在点亮的星上。点一颗可以回看。");
    return;
  }
  feedback = "对上智能体这一团。底下是整条路，你只做这一下。";
  showScene(next);
}

function speakAbout(n) {
  if (!n.title) return;
  cardEl.hidden = false;
  const blocked = (n.requires || []).filter((r) => !byId(r).lit);
  if (n.region !== "agent" || !n.lane) {
    anchorId = n.id;
    cardEl.className = "card";
    const where = n.region === "dl" ? "深度学习" : n.region === "biz" ? "经营能力" : "智能体";
    focusSet(nodes.filter((item) => item.region === n.region && item.title).map((item) => item.id));
    cardEl.innerHTML = `
      <p class="kicker">${esc(where)}</p>
      <h2>${esc(n.title)}</h2>
      <p class="sit">它在这一团里，不在你正在走的泳道上。</p>
      <button type="button" data-return>回到正在做的这一下</button>`;
    placeCard();
    return;
  }
  if (n.lit) {
    showReview(n);
    return;
  }
  if (blocked.length) {
    anchorId = n.id;
    cardEl.className = "card";
    focusSet([n.id, ...blocked]);
    cardEl.innerHTML = `
      <p class="kicker">${esc(n.title)}</p>
      <p class="sit">还连在「${esc(blocked.map((id) => byId(id).title).join("、"))}」后面。可以看，现在先做前面那一下。</p>
      <button type="button" data-return>回到正在做的这一下</button>`;
    placeCard();
    return;
  }
  feedback = "";
  showScene(n);
}

function play(n, choice) {
  if (!choice.ok) {
    n.miss = Date.now();
    feedback = `失手。${choice.back}`;
    showScene(n);
    return;
  }
  n.lit = true;
  n.burst = Date.now();
  n.decision = choice.t;
  n.note = choice.back;
  nodes.filter((s) => !s.lane && (s.requires || [])[0] === n.id).forEach((s) => {
    s.lit = true;
    s.burst = Date.now();
  });
  renderPath();
  const next = byId(readyId());
  focusSet([n.id]);
  feedback = `点亮了。技能树这一层、泳道「${n.lane}」、知识世界里的智能体，是同一颗。`;
  if (!next) {
    activeId = null;
    sayEl.value = "";
    showNote(n.title, `${choice.back} 七颗都点亮了。三处是同一批。`);
    return;
  }
  showScene(next);
}

function handle(text) {
  const t = text.trim();
  if (!t) return;
  const hitChoice = findChoice(t);
  if (hitChoice && hitChoice.choice) {
    play(byId(hitChoice.id), hitChoice.choice);
    return;
  }
  sayEl.value = "";
  if (/短视频|博主/.test(t)) {
    showNote("对不上", "知识世界里没有短视频这一团。不会为这句话临时画一条完整的路。");
    return;
  }
  if (/深度|卷积|transformer|注意力/i.test(t)) {
    focusSet(nodes.filter((n) => n.region === "dl").map((n) => n.id));
    anchorId = "cnn";
    cardEl.className = "card";
    cardEl.innerHTML = `
      <p class="kicker">深度学习</p>
      <p class="sit">在左侧那一团：卷积、注意力、Transformer、预训练。和智能体这条泳道不是同一条路。</p>
      <button type="button" data-return>回到正在做的这一下</button>`;
    placeCard();
    return;
  }
  if (/越南|供应|企业|基地/.test(t)) {
    focusSet(nodes.filter((n) => n.region === "biz").map((n) => n.id));
    anchorId = "supply";
    cardEl.className = "card";
    cardEl.innerHTML = `
      <p class="kicker">经营能力</p>
      <p class="sit">在右侧：供应协同、供应商准入、基地切换。</p>
      <button type="button" data-return>回到正在做的这一下</button>`;
    placeCard();
    return;
  }
  if (/已经会|我会/.test(t)) {
    const n = byId("ch1");
    n.lit = true;
    n.decision = "进来之前就会描述任务环境";
    n.note = "记成已经会了";
    renderPath();
    feedback = "这一颗记成已经会了。下一颗换你来判断。";
    showScene(byId("ch2"));
    return;
  }
  pathReply();
}

document.getElementById("saybar").addEventListener("submit", (e) => {
  e.preventDefault();
  handle(sayEl.value);
});
document.getElementById("send").onclick = () => handle(sayEl.value);
sayEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handle(sayEl.value);
  }
});
document.querySelectorAll("[data-say]").forEach((btn) => {
  btn.onclick = () => handle(btn.dataset.say);
});
const lenses = document.getElementById("lenses");
if (lenses) lenses.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-view]");
  if (!btn) return;
  clearTour();
  setView(btn.dataset.view);
  const current = byId(activeId || readyId());
  if (current) {
    anchorId = current.id;
    focusSet([current.id]);
    renderLink(current);
    if (!cardEl.hidden) placeCard();
  }
});
document.getElementById("board").addEventListener("click", (e) => {
  const nodeBtn = e.target.closest("[data-node]");
  if (nodeBtn) speakAbout(byId(nodeBtn.dataset.node));
});
document.getElementById("path").addEventListener("click", (e) => {
  const nodeBtn = e.target.closest("[data-node]");
  if (nodeBtn) speakAbout(byId(nodeBtn.dataset.node));
});
cardEl.addEventListener("click", (e) => {
  if (e.target.closest("[data-return]")) {
    returnToStep();
    return;
  }
  const pick = e.target.closest("[data-pick]");
  if (!pick) return;
  const n = byId(pick.dataset.node);
  play(n, SCENES[n.id].choices[Number(pick.dataset.pick)]);
});

const mic = document.getElementById("mic");
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Rec) {
  mic.title = "这个浏览器没有语音输入";
} else {
  const rec = new Rec();
  rec.lang = "zh-CN";
  rec.onresult = (ev) => {
    sayEl.value = ev.results[0][0].transcript;
    mic.classList.remove("on");
    handle(sayEl.value);
  };
  rec.onerror = () => mic.classList.remove("on");
  rec.onend = () => mic.classList.remove("on");
  mic.onclick = () => {
    mic.classList.add("on");
    rec.start();
  };
}

renderPath();
renderLink(byId(readyId()));
cardEl.hidden = true;
focusSet([readyId()]);
if (embed) setView(view);
