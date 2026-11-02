import { test, expect, Page } from "@playwright/test";
async function login(page: Page, n: number) {
  await page.goto("/");
  await page.getByLabel("Mobile number").fill("900000000" + n);
  await page.getByLabel("Six-digit PIN").fill("681429");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "↓ Refresh" })).toBeVisible();
}
async function logout(page: Page) {
  await page.getByLabel("Account").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}
test("request to partial dispatch and confirmed receipt, with downloadable reports", async ({
  page,
}) => {
  await login(page, 2);
  await page.getByRole("button", { name: /Pilot - Sample Site/ }).click();
  await page.getByRole("button", { name: "+ New requisition" }).click();
  await page.getByLabel("Material description").fill("18 mm plywood");
  await page.getByLabel("Quantity", { exact: true }).fill("20");
  await page
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("sheet");
  await page.reload();
  await expect(page.getByLabel("Material description")).toHaveValue(
    "18 mm plywood",
  );
  await page.getByRole("button", { name: "Submit requisition" }).click();
  await expect(page.getByRole("heading", { name: "MR-000001" })).toBeVisible();
  await logout(page);
  await login(page, 1);
  await page.getByRole("button", { name: /MR-000001/ }).click();
  await page.getByRole("button", { name: "Approve requisition" }).click();
  await expect(
    page.getByText("Approved", { exact: true }).first(),
  ).toBeVisible();
  await logout(page);
  await login(page, 3);
  await page.getByRole("button", { name: /18 mm plywood/ }).click();
  await page.getByRole("button", { name: "Mark ordered" }).click();
  await page.getByLabel("Supplier (optional)").fill("Sample supplier");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Record dispatch" }).click();
  await page.getByLabel(/Quantity \(sheet\)/).fill("12");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Dispatched", { exact: true }).first(),
  ).toBeVisible();
  await logout(page);
  await login(page, 2);
  await page.getByRole("button", { name: /Pilot - Sample Site/ }).click();
  await page.getByRole("button", { name: /MR-000001/ }).click();
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await page.getByLabel(/Quantity \(sheet\)/).fill("10");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Part received", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Daily report" }),
  ).toBeVisible();
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ PDF" }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  const excel = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Excel" }).click();
  expect((await excel).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.screenshot({
    path: "test-results/report-mobile.png",
    fullPage: true,
  });
});
test("director can add a site and delegate its approval", async ({ page }) => {
  await login(page, 0);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: "Sites", exact: true }).click();
  await page.getByRole("button", { name: "+ Add site" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Pilot - Second Site");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Pilot - Second Site/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Users", exact: true }).click();
  await page.getByRole("button", { name: /Test manager/i }).click();
  await page.getByLabel("Pilot - Second Site").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit user" }),
  ).not.toBeVisible();
});
