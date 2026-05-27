const { test, expect } = require('@playwright/test');
const {
    collectFrameNavigations,
    completeSetupWizardIfShown,
    expectStableDesk,
    loginAsAdministrator,
    waitForPlaygroundBoot,
} = require('./helpers/frappeFlow');

test('full boot login setup desk flow reaches stable Desk without redirect loop', async ({ page }) => {
    test.setTimeout(600000);

    const navigations = collectFrameNavigations(page);
    const { instanceId } = await waitForPlaygroundBoot(page);
    await loginAsAdministrator(page);

    const setupState = await completeSetupWizardIfShown(page);
    expect(setupState).toBe('wizard');

    const desk = await expectStableDesk(page, navigations);
    const iframeNavigations = navigations.filter(navigation => navigation.name === 'iframe');
    const deskNavigations = iframeNavigations.filter(navigation => navigation.url === 'http://localhost:8000/desk');

    expect(instanceId).toBeTruthy();
    expect(desk.href).toContain('/desk');
    expect(desk.href).not.toContain('/desk/build');
    expect(desk.hasNestedPlayground).toBe(false);
    expect(desk.homePage).not.toBe('setup-wizard');
    expect(desk.homePage).not.toBe('Build');
    expect(desk.bodyText).not.toContain('Page Build not found');
    expect(deskNavigations.length).toBeLessThanOrEqual(3);
});
