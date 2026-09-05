import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const output = process.argv[2] ?? "/tmp/eduflow-cds525-h5p";
await mkdir(output, { recursive: true });

// DragQuestion uses percent positions but em dimensions at 16px authored font size.
const emSize = (percent: number, axisPixels: number) => percent * axisPixels / 100 / 16;
const json = (value: unknown) => strToU8(JSON.stringify(value));

async function download(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function buildDragQuestion(
  templateName: string,
  id: string,
  mutate: (content: Record<string, unknown>, files: Record<string, Uint8Array>) => void,
) {
  const source = `https://h5p.org/sites/default/files/h5p/exports/${templateName}.h5p`;
  const files = unzipSync(await download(source));
  const definition = JSON.parse(strFromU8(files["h5p.json"])) as Record<string, unknown>;
  const content = JSON.parse(strFromU8(files["content/content.json"])) as Record<string, unknown>;

  mutate(content, files);

  definition.title = id;
  definition.license = "CC BY";
  definition.licenseVersion = "4.0";
  definition.authors = [
    { name: "H5P Group", role: "Originator" },
    { name: "EduFlow", role: "Editor" },
  ];
  definition.source = source;

  files["h5p.json"] = json(definition);
  files["content/content.json"] = json(content);
  await writeFile(join(output, `${id}.h5p`), zipSync(files, { level: 6, mtime: new Date("2020-01-01T00:00:00.000Z") }));
}

await buildDragQuestion(
  "drag-and-drop-712",
  "cds525-h5p-k001-rule-vs-learning",
  (content, files) => {
    const question = content.question as Record<string, any>;

    question.taskDescription =
      "<p>把每个问题拖到更合适的解决方式。目标不是判断‘AI 能不能做’，而是判断是否值得让模型从数据中学习规律。</p>";
    question.settings = {
      size: { width: 800, height: 520 },
      background: {
        path: "images/rule-vs-learning.svg",
        mime: "image/svg+xml",
        width: 800,
        height: 520,
        copyright: { license: "CC0" },
      },
    };

    const cards = [
      { label: "根据半径计算圆面积", correctZone: "0" },
      { label: "摄氏度转换为华氏度", correctZone: "0" },
      { label: "验证身份证号码格式", correctZone: "0" },
      { label: "判断商品评论情感", correctZone: "1" },
      { label: "识别图片中的猫和狗", correctZone: "1" },
      { label: "识别垃圾邮件", correctZone: "1" },
    ];

    content.behaviour = { ...(content.behaviour as Record<string, unknown>), autoAlignSpacing: 2, enableFullScreen: true, showTitle: false };

    question.task = {
      elements: cards.map((card, index) => ({
        type: {
          library: "H5P.AdvancedText 1.1",
          params: { text: `<p style="font-size:1.4em;line-height:1.2;margin:0">${card.label}</p>` },
          subContentId: `cds525-k001-element-${index}`,
          metadata: { title: card.label, license: "CC0", contentType: "Text" },
        },
        x: [6, 37, 68][index % 3],
        y: index < 3 ? 62 : 79,
        width: emSize(26, 800),
        height: emSize(11, 520),
        dropZones: ["0", "1"],
        backgroundOpacity: 100,
        multiple: false,
      })),
      dropZones: [
        {
          x: 6,
          y: 12,
          width: emSize(41, 800),
          height: emSize(42, 520),
          label: "可以直接写明确规则",
          correctElements: ["0", "1", "2"],
          showLabel: true,
          backgroundOpacity: 88,
          single: false,
          autoAlign: true,
          tipsAndFeedback: {
            tip: "规则明确、稳定、可以直接写成公式或校验逻辑。",
            feedbackOnCorrect: "正确：这类问题有明确规则，不需要通过训练去猜规律。",
            feedbackOnIncorrect: "再想想：这个问题是否存在明确、稳定、可直接编码的规则？",
          },
        },
        {
          x: 53,
          y: 12,
          width: emSize(41, 800),
          height: emSize(42, 520),
          label: "更适合从数据中学习",
          correctElements: ["3", "4", "5"],
          showLabel: true,
          backgroundOpacity: 88,
          single: false,
          autoAlign: true,
          tipsAndFeedback: {
            tip: "输入变化复杂，人工规则难以穷举，需要从样本中学习模式。",
            feedbackOnCorrect: "正确：这类任务的变化组合复杂，更适合从数据中学习预测规律。",
            feedbackOnIncorrect: "再想想：能否现实地穷举所有语言、图像或垃圾邮件模式？",
          },
        },
      ],
    };

    files["content/images/rule-vs-learning.svg"] = strToU8(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><rect width="800" height="520" fill="#f7f9fc"/></svg>',
    );

    for (const name of Object.keys(files)) {
      if (name.startsWith("content/images/") && !name.endsWith("rule-vs-learning.svg")) delete files[name];
    }
  },
);

console.log(`Built CDS525 K001 H5P smoke package in ${output}.`);
