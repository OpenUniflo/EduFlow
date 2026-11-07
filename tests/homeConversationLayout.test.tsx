import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AssistantUIMessage } from '@/features/assistant/AssistantRuntimeContext';
import type { AssistantCardActions } from '@/features/assistant/cards/AssistantCardView';
import { HomeConversation } from '@/features/home/HomeConversation';
import type { MockSession } from '@/features/auth/types';

const css = readFileSync('src/features/home/home.css', 'utf8');

function rule(selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing selector ${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

const session = { userId: 'user', name: '测试', email: 'test@example.test', role: 'student' } as MockSession;
const actions: AssistantCardActions = {
  openCourse: () => undefined,
  openPractice: () => undefined,
  openBrief: () => undefined,
  openMaterial: () => undefined,
  recordMicroCompleted: () => undefined
};

function conversation(messages: AssistantUIMessage[], error = '') {
  return renderToStaticMarkup(
    <MemoryRouter>
      <HomeConversation
        messages={messages}
        session={session}
        cardActions={actions}
        loading={false}
        sending={false}
        error={error}
        contexts={[]}
        onRemoveContext={() => undefined}
        onSend={() => true}
        suggestions={[]}
        previewPerson={null}
        onRetry={() => undefined}
      />
    </MemoryRouter>
  );
}

const message = (parts: AssistantUIMessage['parts'], metadata?: AssistantUIMessage['metadata']): AssistantUIMessage => ({ id: 'm', role: 'assistant', parts, ...(metadata ? { metadata } : {}) });

describe('Home conversation column anchor', () => {
  it('keeps the composer after the timeline inside one full-height scroller', () => {
    const html = conversation([]);
    const scroller = html.indexOf('ef-home-scroller');
    const title = html.indexOf('ef-home-titlebar');
    const timeline = html.indexOf('ef-home-timeline');
    const composer = html.indexOf('ef-home-composer');
    expect(scroller).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(scroller);
    expect(timeline).toBeGreaterThan(title);
    expect(composer).toBeGreaterThan(timeline);
  });

  it('renders the shared open question without the retired hardcoded greeting', () => {
    const html = conversation([]);
    expect(html).toContain('ef-home-empty');
    expect(html).toContain('想聊点什么？');
    expect(html).not.toContain('你好，我是 EduFlow');
  });

  it('shows an explicit empty-reply state and the retry action', () => {
    const html = conversation([message([])], '助手这次没有生成有效回复，请重试。');
    expect(html).not.toContain('正在回复…');
    expect(html).toContain('这次没有生成回复，请重试。');
    expect(html).toContain('重试');
  });

  it('shows the stopped marker without a retry error', () => {
    const html = conversation([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '分六点说明' }], metadata: { stopped: true } }
    ]);
    expect(html).toContain('已停止回复');
    expect(html).not.toContain('回复没有完成。请重试。');
    expect(html).not.toContain('>重试<');
  });

  it('shows the fixed hidden hint and never the original protocol text', () => {
    const html = conversation([message([{ type: 'text', text: '<｜｜DSML｜｜ calls>' }], { invalidReason: 'protocol_leak' })]);
    expect(html).toContain('这条回复格式异常，已隐藏');
    expect(html).not.toContain('DSML');
  });

  it('renders text and a card in the message part order', () => {
    const html = conversation([
      message([
        { type: 'text', text: '先看一段说明。' },
        {
          type: 'tool-displayCard',
          toolCallId: 'card-1',
          state: 'output-available',
          input: { cardType: 'knowledge', nodeId: 'node-1' },
          output: { card: { cardType: 'knowledge', nodeId: 'node-1' }, display: { title: '要点标题', kicker: '要点', description: '一段要点说明' } }
        },
        { type: 'text', text: '再看后面的说明。' }
      ])
    ]);
    const first = html.indexOf('先看一段说明。');
    const card = html.indexOf('要点标题');
    const second = html.indexOf('再看后面的说明。');
    expect(first).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(card);
  });

  it('renders a legacy Course Search card from structured content', () => {
    const html = conversation([message([{ type: 'text', text: '我找到了这些课程。' }], {
      structuredContent: {
        type: 'course_search', schemaVersion: 1, planningId: 'p1', goalText: '搞懂 Agent', intentSummary: '围绕 Agent 的学习目标',
        plan: { resolution: { status: 'no_match', goalText: '搞懂 Agent', targetKnowledge: [], candidates: [], reason: '暂无' }, prerequisiteKnowledge: [], prerequisiteCycleDetected: false, matches: [] }
      }
    })]);
    expect(html).toContain('我找到了这些课程。');
    expect(html).toContain('课程匹配');
    expect(html).toContain('课程匹配结果');
  });

  it('renders a legacy Course Creation Brief with its creation entry', () => {
    const html = conversation([message([{ type: 'text', text: '简报已经整理好。' }], {
      structuredContent: {
        type: 'course_creation_brief', schemaVersion: 1, briefId: 'b1', planningId: 'p1', planningMessageId: 'p1', goal: '做一个能查文档的 Agent',
        targetKnowledge: [{ id: 'n1', title: '检索增强', description: '说明' }], referenceMaterialIntent: 'none'
      }
    })]);
    expect(html).toContain('课程创建简报');
    expect(html).toContain('做一个能查文档的 Agent');
    expect(html).toContain('进入课程创建');
  });

  it('fills the work area and keeps the bars sticky when a side panel is pushed open', () => {
    const work = rule('.ef-home.has-panel .ef-home-work,');
    expect(work).toContain('display: grid');
    expect(work).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.ef-home-column {')).toContain('height: 100%');
    expect(rule('.ef-home-conversation {')).toContain('flex: 1');
    expect(rule('.ef-home-scroller {')).toContain('overflow-y: auto');
    expect(rule('.ef-home-titlebar {')).toContain('position: sticky');
    expect(rule('.ef-home-composer {')).toContain('position: sticky');
  });
});
