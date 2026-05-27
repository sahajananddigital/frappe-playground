const { test, expect } = require('@playwright/test');

test('iframe and main page reload keep the same scoped runtime', async ({ page }) => {
    test.setTimeout(600000);

    await page.goto('/');
    await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 600000 });

    const firstInstanceId = await page.evaluate(() => sessionStorage.getItem('frappe_playground_instance_id'));
    const iframe = page.locator('#frappe-desk');

    // Wait for the iframe to be fully loaded and visible
    await expect(iframe).toBeVisible({ timeout: 120000 });
    
    // The instance id should be preserved and the scope should remain identical
    await expect(iframe).toHaveAttribute('src', new RegExp(`^/\\?__scope=${firstInstanceId}$`));

    const frame = await iframe.elementHandle();
    const contentFrame = await frame.contentFrame();
    await contentFrame.evaluate(() => location.reload());
    await expect(iframe).toHaveAttribute('src', new RegExp(`^/\\?__scope=${firstInstanceId}$`));

    await page.reload();
    await expect(page.locator('#loading-screen')).toBeHidden({ timeout: 600000 });

    const reloadedInstanceId = await page.evaluate(() => sessionStorage.getItem('frappe_playground_instance_id'));
    await expect(page.locator('#frappe-desk')).toHaveAttribute('src', new RegExp(`^/\\?__scope=${firstInstanceId}$`));
    expect(reloadedInstanceId).toBe(firstInstanceId);
});
