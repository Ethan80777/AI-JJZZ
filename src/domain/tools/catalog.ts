import type { Row, ValidationIssue } from '../../shared/model';
export type ToolDefinition = {
  id: string;
  name: string;
  category: string;
  steps: string[];
  url: string;
  verification: 'unverified' | 'documented' | 'tested';
  mode: 'manual' | 'api';
  checkedAt: string | null;
};
const entry = (
  id: string,
  name: string,
  category: string,
  steps: string[],
  url: string,
): ToolDefinition => ({
  id,
  name,
  category,
  steps,
  url,
  verification: 'unverified',
  mode: 'manual',
  checkedAt: null,
});
export const TOOLS: ToolDefinition[] = [
  entry(
    'manual',
    '手動製作',
    '工作台',
    Array.from({ length: 14 }, (_, i) => String(i + 1).padStart(2, '0')),
    '',
  ),
  entry('chatgpt', 'ChatGPT', '文字', ['01', '02', '03', '04', '05', '11'], 'https://chatgpt.com'),
  entry('deepseek', 'DeepSeek', '文字', ['01', '02', '03', '04', '05'], 'https://www.deepseek.com'),
  entry('doubao', '豆包', '文字', ['03', '04'], 'https://www.doubao.com'),
  entry('seko', '商湯 Seko', '劇集', ['02', '04', '11'], 'https://www.sensetime.com'),
  entry(
    'xiaoyunque',
    '小雲雀',
    '劇集',
    ['02', '04', '06', '09', '10', '11'],
    'https://www.dreamina.com',
  ),
  entry(
    'seedance',
    '即夢 / Seedance',
    '影片',
    ['06', '07', '08', '11'],
    'https://jimeng.jianying.com',
  ),
  entry('kling', '可靈 Kling', '影片', ['08', '09'], 'https://klingai.com'),
  entry('veo', 'Google Veo', '影片', ['08'], 'https://deepmind.google/models/veo/'),
  entry('sora', 'OpenAI Sora', '影片', ['08'], 'https://openai.com/sora/'),
  entry('gpt-image', 'GPT Image', '圖像', ['05', '06', '07'], 'https://openai.com'),
  entry('nano-banana', 'Nano Banana', '圖像', ['06', '07'], 'https://gemini.google.com'),
  entry(
    'runninghub',
    'RunningHub',
    '工作流',
    ['05', '06', '07', '08'],
    'https://www.runninghub.ai',
  ),
  entry('liblib', 'LiblibAI', '工作流', ['06', '07'], 'https://www.liblib.art'),
  entry('comfy', 'ComfyUI / Wan / Qwen', '工作流', ['06', '07', '08'], 'https://www.comfy.org'),
  entry('lovart', 'Lovart', '圖像', ['07'], 'https://www.lovart.ai'),
  entry('higgsfield', 'Higgsfield', '影片', ['08'], 'https://higgsfield.ai'),
  entry('elevenlabs', 'ElevenLabs', '聲音', ['09', '11'], 'https://elevenlabs.io'),
  entry('minimax', 'MiniMax', '聲音', ['09'], 'https://www.minimax.io'),
  entry('suno', 'Suno', '音樂', ['09'], 'https://suno.com'),
  entry('capcut', '剪映 / CapCut', '後期', ['09', '10', '11'], 'https://www.capcut.com'),
  entry('heygen', 'HeyGen', '本地化', ['11'], 'https://www.heygen.com'),
  entry('domo', 'DomoAI', '本地化', ['11'], 'https://domoai.app'),
  entry('feishu', '飛書 / WPS', '協作', ['01', '05', '14'], 'https://www.feishu.cn'),
];
export function checkToolBinding(
  stepKey: string,
  tool: ToolDefinition,
  parameters: Row,
): ValidationIssue[] {
  const result: ValidationIssue[] = [];
  if (!tool.steps.includes(stepKey))
    result.push({ code: 'CAPABILITY', message: '工具不支援此步驟' });
  if (Object.keys(parameters).length)
    result.push({
      code: 'MANUAL',
      message: '尚未接入 API，不接受模型參數或金鑰；請匯出提示詞手動操作',
    });
  return result;
}
export function validateCustomTool(row: Row): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!row.id || !row.name?.trim()) issues.push({ code: 'TOOL', message: '工具名稱不可空白' });
  if (row.url) {
    try {
      const u = new URL(row.url);
      if (u.protocol !== 'https:' || u.username || u.password) throw Error();
    } catch {
      issues.push({ code: 'URL', message: '請填入不含帳密的 HTTPS 網址' });
    }
  }
  if (!(row.steps ?? '').split(',').some((k) => /^0[1-9]$|^1[0-4]$/.test(k.trim())))
    issues.push({ code: 'STEPS', message: '請選擇適用步驟' });
  return issues;
}
export function getTools(rows: Row[] = []): ToolDefinition[] {
  const all = new Map(TOOLS.map((t) => [t.id, t]));
  for (const row of rows) {
    if (row.archived === 'true') {
      all.delete(row.id);
      continue;
    }
    if (validateCustomTool(row).length) continue;
    all.set(row.id, {
      id: row.id,
      name: row.name,
      category: row.category || '自訂',
      steps: row.steps.split(',').map((k) => k.trim()),
      url: row.url || '',
      mode: 'manual',
      verification: 'unverified',
      checkedAt: null,
    });
  }
  return [...all.values()];
}
