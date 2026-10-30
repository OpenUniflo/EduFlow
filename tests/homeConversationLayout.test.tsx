import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomeConversation } from '@/features/home/HomeConversation';

const css = readFileSync('src/features/home/home.css', 'utf8');

function rule(selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing selector ${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

describe('Home conversation column anchor', () => {
  it('keeps the composer after the timeline inside the conversation column', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <HomeConversation
          messages={[]}
          loading={false}
          sending={false}
          error=""
          contexts={[]}
          onRemoveContext={() => undefined}
          onSend={() => true}
          suggestions={[]}
          previewPerson={null}
          onRetry={() => undefined}
        />
      </MemoryRouter>
    );
    const timeline = html.indexOf('ef-home-timeline');
    const composer = html.indexOf('ef-home-composer');
    expect(timeline).toBeGreaterThan(-1);
    expect(composer).toBeGreaterThan(timeline);
  });

  it('fills the work area and column when a side panel is pushed open', () => {
    const work = rule('.ef-home.has-panel .ef-home-work,');
    expect(work).toContain('display: grid');
    expect(work).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.ef-home-column {')).toContain('height: 100%');
    expect(rule('.ef-home-conversation {')).toContain('flex: 1');
    expect(rule('.ef-home-composer {')).toContain('margin-top: auto');
  });
});
