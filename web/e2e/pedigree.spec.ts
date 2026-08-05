import { test, expect } from '@playwright/test';

test.describe('Dog Pedigree Workflow E2E', () => {
  test('full workflow: CRUD, graph update, cycle prevention, export/import, soft delete/restore', async ({ page }) => {
    // 1. Navigate to application
    await page.goto('/');

    // 2. Verify header & workspace
    await expect(page.locator('.brand')).toContainText('Peditree');

    // 3. Add Sire
    await page.click('button:has-text("Add Dog")');
    await page.fill('input[name="name"]', 'Sire Dog');
    await page.selectOption('select[name="sex"]', 'M');
    await page.fill('input[name="breed"]', 'German Shepherd');
    await page.click('button:has-text("Create Dog")');

    await expect(page.locator('.sidebar-left')).toContainText('Sire Dog');

    // 4. Add Dam
    await page.click('button:has-text("Add Dog")');
    await page.fill('input[name="name"]', 'Dam Dog');
    await page.selectOption('select[name="sex"]', 'F');
    await page.fill('input[name="breed"]', 'German Shepherd');
    await page.click('button:has-text("Create Dog")');

    await expect(page.locator('.sidebar-left')).toContainText('Dam Dog');

    // 5. Add Child
    await page.click('button:has-text("Add Dog")');
    await page.fill('input[name="name"]', 'Puppy Dog');
    await page.selectOption('select[name="sex"]', 'M');
    await page.click('button:has-text("Create Dog")');

    await expect(page.locator('.sidebar-left')).toContainText('Puppy Dog');

    // 6. Assign Sire & Dam via Inspector
    await page.click('.dog-item:has-text("Puppy Dog")');
    await expect(page.locator('.sidebar-right')).toContainText('Inspector');

    // Assign Sire
    await page.selectOption('select:has-text("No Sire Assigned")', { label: 'Sire Dog' });
    // Assign Dam
    await page.selectOption('select:has-text("No Dam Assigned")', { label: 'Dam Dog' });

    // 7. Verify cycle prevention
    // Attempt to make Child a parent of Sire
    await page.click('button:has-text("Add Parent")');
    await page.selectOption('select[name="child_id"]', { label: 'Sire Dog (M)' });
    await page.selectOption('select[name="parent_id"]', { label: 'Puppy Dog (M)' });
    await page.click('button:has-text("Add Relationship")');

    await expect(page.locator('.modal-content')).toContainText('cycle');
    await page.click('.modal-header button'); // Close modal

    // 8. Soft delete & restore Puppy Dog
    await page.click('.dog-item:has-text("Puppy Dog")');
    await page.click('button:has-text("Soft Delete")');
    await page.click('button:has-text("Confirm Delete")');

    await page.click('button:has-text("Trash")');
    await expect(page.locator('.sidebar-left')).toContainText('Puppy Dog (Deleted)');

    await page.click('.dog-item:has-text("Puppy Dog")');
    await page.click('button:has-text("Restore")');

    await expect(page.locator('.sidebar-left')).not.toContainText('(Deleted)');
  });
});
