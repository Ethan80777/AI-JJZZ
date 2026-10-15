import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('desktop project creation, fourteen-step canvas, edits, Arabic subtitles and reload', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-e2e-'));
  const app = await electron.launch({
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--user-data-dir=' + path.join(root, 'user-data'),
      path.resolve('out/main/index.js'),
    ],
    env: {
      ...process.env,
      DISPLAY: ':99',
      XDG_CONFIG_HOME: '/workspace/.config',
      XDG_CACHE_HOME: '/workspace/.cache',
    },
  });
  const child = app.process();
  console.log('Electron launched');
  const page = await app.firstWindow();
  console.log('Window available');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await expect(page.getByText('讓下一個故事，')).toBeVisible();
    console.log('Welcome ready');
    expect(await page.evaluate(() => typeof (window as any).require)).toBe('undefined');
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      },
      path.join(root, '月光 測試.aidrama'),
    );
    await page.getByRole('button', { name: '＋ 建立第一個劇集' }).click();
    await page.getByLabel('劇集名稱').fill('月光下的第七封信');
    await page.getByRole('button', { name: '選擇儲存位置並建立 ↗' }).click();
    await expect(page.locator('.flow-card')).toHaveCount(14);
    console.log('Canvas ready');
    await page
      .locator('.flow-card')
      .filter({ has: page.getByRole('heading', { name: '題材定位', exact: true }) })
      .click();
    await page.getByLabel('劇名', { exact: true }).fill('月光下的第七封信');
    await page
      .getByLabel('一句話故事')
      .fill('一位修復師發現七封未寄出的信，決定找回城市遺失的記憶。');
    await page.getByRole('button', { name: '儲存工作', exact: true }).click();
    await expect(page.locator('.editor-status')).toContainText('已儲存到本機');
    await page.getByLabel('關閉編輯器').click();
    await page.getByRole('button', { name: /展開步驟清單/ }).click();
    await page.getByRole('button', { name: '11 多語本地化', exact: true }).click();
    await page.getByRole('combobox', { name: '目標語言', exact: true }).fill('ar');
    await page.getByRole('button', { name: '＋ 建立版本' }).click();
    await page.getByRole('button', { name: '新增字幕', exact: true }).click();
    await page.getByLabel('字幕1文字').fill('مرحباً 2026!');
    await expect(page.getByTestId('subtitle-preview')).toHaveAttribute('dir', 'rtl');
    await page.getByLabel('關閉編輯器').click();
    await page.getByRole('button', { name: '備份', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('一致性備份已建立');
    await page.getByRole('status').getByRole('button').click();
    await page.screenshot({ path: 'test-results/workspace.png' });
    await page.reload();
    await expect(page.locator('.flow-card')).toHaveCount(14);
    await page.getByRole('button', { name: /展開步驟清單/ }).click();
    await page.getByRole('button', { name: '02 題材定位', exact: true }).click();
    await expect(page.getByLabel('劇名', { exact: true })).toHaveValue('月光下的第七封信');
    await expect(page.getByLabel('一句話故事')).toHaveValue(/修復師/);
    expect(errors).toEqual([]);
    const closed = app.waitForEvent('close', { timeout: 10000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closed;
    expect(fs.existsSync(path.join(root, '月光 測試.assets', '.writer-lock'))).toBe(false);
  } finally {
    await page.screenshot({ path: 'test-results/last-screen.png' }).catch(() => {});
    if (child.exitCode === null) child.kill('SIGKILL');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
