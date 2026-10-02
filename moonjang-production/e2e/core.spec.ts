import { test, expect } from '@playwright/test';

test('reader to writer core journey', async ({ page }) => {
  const handle = `tester_${Date.now().toString().slice(-8)}`;
  await page.goto('/');
  await expect(page.getByText('좋은 문장을 남기고')).toBeVisible();
  await page.getByLabel('필명').fill('테스터');
  await page.getByLabel('문장가 주소').fill(handle);
  await page.getByRole('button', {name:'시작하기'}).click();
  await expect(page.getByText('오늘 머물다 갈 문장들')).toBeVisible();
  await page.getByRole('button', {name:'쓰기', exact:true}).click();
  await page.getByPlaceholder('오늘 남기고 싶은 문장이 있나요?').fill('테스트가 통과한 문장은 오래 남는다.');
  await page.getByRole('button', {name:'남기기', exact:true}).click();
  await expect(page.getByText('테스트가 통과한 문장은 오래 남는다.')).toBeVisible();
  await page.getByRole('button', {name:'간직하기', exact:true}).first().click();
  await page.getByRole('button', {name:'서랍', exact:true}).click();
  await expect(page.getByText('오래 두고 싶은 문장들.')).toBeVisible();
  await page.getByRole('button', {name:'나', exact:true}).click();
  await expect(page.getByText('나의 기록')).toBeVisible();
});
