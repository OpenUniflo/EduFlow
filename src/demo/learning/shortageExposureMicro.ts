/** Explicit teaching fixture for the enterprise Action-loop acceptance, not learner evidence. */
export const shortageExposureMicro = {
  path: { id: 'micro-shortage-exposure', knowledge_id: 'supply-shortage-exposure', course_id: null, scope: 'global', title: '识别缺料暴露窗口', description: '区分当期缺口、累计积欠与恢复时间。', mode: 'learn', estimated_minutes: 20, required: true, revision: 1 },
  unit: { id: 'micro-shortage-exposure-periods', path_id: 'micro-shortage-exposure', title: '从逐期库存看暴露窗口', position: 0, estimated_minutes: 20, required: true },
  steps: [
    { id: 'micro-shortage-exposure-explain', unit_id: 'micro-shortage-exposure-periods', position: 0, kind: 'explanation', title: '缺口会不会在下一期自动消失？', content: '需求未满足时，如果订单继续有效，缺口会形成积欠，不能在下一期凭空清零。逐期净结余＝上期净结余＋本期到货－本期需求。负值表示累计积欠。负值首次出现到恢复为非负的区间，是需要处置的缺料暴露窗口。若现实业务允许取消或延期订单，必须另行记录该假设。' },
    { id: 'micro-shortage-exposure-calculate', unit_id: 'micro-shortage-exposure-periods', position: 1, kind: 'check', title: '计算第二期积欠', content: '可用库存70，第1期需求150、到货0，第2期需求100、到货120。需求必须满足且积欠跨期。第2期末累计积欠是多少？', interaction: { type: 'choice', options: ['0，第二期到货大于需求', '60，第一期积欠80，第二期只追回20', '100，忽略两期到货'], correctIndex: 1 }, success_feedback: '第1期结余−80，第2期−80＋120−100＝−60，因此仍积欠60。', retry_feedback: '第二期新增到货先填补此前积欠，不能把第一期缺口清零。' },
    { id: 'micro-shortage-exposure-window', unit_id: 'micro-shortage-exposure-periods', position: 2, kind: 'application', title: '判断恢复时间', content: '前两期末净结余−80、−60。第3期到货100、需求80，第4期到货60、需求20；所有积欠跨期。在按期末评估的假设下，什么时候解除缺料暴露？', interaction: { type: 'choice', options: ['第2期末，因为到货大于当期需求', '第3期末，因为有到货', '第4期末，净结余依次为−40、0'], correctIndex: 2 }, success_feedback: '缺料从第1期开始，到第4期末累计积欠归零。期内是否停线，还需结合到货时点和订单消耗时间。', retry_feedback: '逐期累计：第3期−60＋100−80＝−40，第4期−40＋60−20＝0。' },
  ],
};
