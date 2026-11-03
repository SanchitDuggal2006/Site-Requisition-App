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
  await page.getByLabel(/Quantity \(sheet\)/).fill("14");
  await page.getByLabel("Supplier (optional)").fill("Sample supplier");
  await page
    .getByLabel("Supplier / delivery contact (optional)")
    .fill("Test desk 9000000099");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Update delivery · batch 1" }).click();
  await page.getByLabel("Delivery status").selectOption("DELAYED");
  await page.getByLabel("Expected delivery").fill("2099-01-01");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Delayed", { exact: true })).toBeVisible();
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
  await (await pdf).saveAs("test-results/redpeach-report.pdf");
  const excel = page.waitForEvent("download");
  await page.getByRole("button", { name: "↓ Excel" }).click();
  expect((await excel).suggestedFilename()).toMatch(/\.xlsx$/);
  await (await excel).saveAs("test-results/redpeach-report.xlsx");
  await page.screenshot({
    path: "test-results/report-mobile.png",
    fullPage: true,
  });
  await logout(page);
  await login(page, 3);
  await page.getByRole("button", { name: "In progress", exact: false }).click();
  await page.getByRole("button", { name: /18 mm plywood/ }).click();
  await page.getByRole("button", { name: "Order next batch" }).click();
  await page.getByLabel(/Quantity \(sheet\)/).fill("6");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Record dispatch" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Record dispatch" }),
  ).not.toBeVisible();
  await logout(page);
  await login(page, 2);
  await page.getByRole("button", { name: /Pilot - Sample Site/ }).click();
  await page.getByRole("button", { name: /MR-000001/ }).click();
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Delivered", { exact: true }).first(),
  ).toBeVisible();
  await logout(page);
  await login(page, 3);
  await page.getByRole("button", { name: /History/ }).click();
  await expect(page.getByRole("button", { name: /MR-000001/ })).toBeVisible();
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

test("rejection can be copied into a new request and the new request can be cancelled", async ({
  page,
}) => {
  await login(page, 2);
  await page.getByRole("button", { name: /Pilot - Sample Site/ }).click();
  await page.getByRole("button", { name: "+ New requisition" }).click();
  await page.getByLabel("Material description").fill("Cement");
  await page.getByLabel("Quantity", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Submit requisition" }).click();
  await expect(page.getByRole("heading", { name: "MR-000002" })).toBeVisible();
  await logout(page);
  await login(page, 1);
  await page.getByRole("button", { name: /MR-000002/ }).click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page.getByLabel("Reason for rejection").fill("Confirm grade first");
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(
    page.getByText("Rejected", { exact: true }).first(),
  ).toBeVisible();
  await logout(page);
  await login(page, 2);
  await page.getByRole("button", { name: /Pilot - Sample Site/ }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: /MR-000002/ }).click();
  await page.getByRole("button", { name: "Copy as new requisition" }).click();
  await expect(page.getByLabel("Material description")).toHaveValue("Cement");
  await page.getByRole("button", { name: "Submit requisition" }).click();
  await expect(page.getByRole("heading", { name: "MR-000003" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Cancel requisition", exact: true })
    .click();
  await expect(
    page.getByText("Cancelled", { exact: true }).first(),
  ).toBeVisible();
});

test("new team member must change the temporary PIN before accessing a site", async ({
  page,
}) => {
  await login(page, 0);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: "+ Add user" }).click();
  await page.getByLabel("Name", { exact: true }).fill("New sample supervisor");
  await page.getByLabel("Mobile number").fill("9000000010");
  await page.getByLabel("Pilot - Sample Site").check();
  await page.getByLabel("Temporary PIN").fill("749182");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /New sample supervisor/ }),
  ).toBeVisible();
  await logout(page);
  await page.getByLabel("Mobile number").fill("9000000010");
  await page.getByLabel("Six-digit PIN").fill("749182");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Set your own PIN" }),
  ).toBeVisible();
  await page.getByLabel("Current PIN", { exact: true }).fill("749182");
  await page.getByLabel("New PIN", { exact: true }).fill("638291");
  await page.getByLabel("Confirm new PIN", { exact: true }).fill("638291");
  await page.getByRole("button", { name: "Save PIN" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Mobile number").fill("9000000010");
  await page.getByLabel("Six-digit PIN").fill("638291");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Pilot - Sample Site/ }),
  ).toBeVisible();
});

test("director switches workspaces, adds a site photo and manager requests a custom unit", async ({
  page,
}) => {
  await login(page, 0);
  await page.getByLabel("Director workspace").selectOption("PURCHASE");
  await expect(
    page.getByRole("heading", { name: "Purchase", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Director workspace").selectOption("MANAGER");
  await expect(
    page.getByRole("heading", { name: "Your sites & approvals" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: "Sites", exact: true }).click();
  await page.getByRole("button", { name: /Pilot - Second Site/ }).click();
  await page.getByLabel("Site status").selectOption("TO_START");
  await page
    .getByLabel("Site photo (optional)")
    .setInputFiles("public/redpeach-logo.png");
  await expect(page.getByAltText("Site preview")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit site" }),
  ).not.toBeVisible();
  await logout(page);
  await login(page, 1);
  await expect(page.getByLabel("Director workspace")).not.toBeVisible();
  await page.getByRole("button", { name: /Pilot - Second Site/ }).click();
  await page.getByRole("button", { name: "+ New requisition" }).click();
  await page.getByLabel("Material description").fill("Decorative stone");
  await page.getByLabel("Quantity", { exact: true }).fill("4");
  await page.getByLabel("Search / type custom unit").fill("pallet");
  await page
    .getByRole("combobox", { name: "Unit", exact: true })
    .selectOption("pallet");
  await page.getByRole("button", { name: "Submit requisition" }).click();
  await page.getByRole("button", { name: "Approve requisition" }).click();
  await expect(
    page.getByText("Approved", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark ordered" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Site overview" }),
  ).toBeVisible();
  await expect(page.getByAltText("Pilot - Second Site site")).toBeVisible();
  await page
    .locator(".site-dashboard")
    .screenshot({ path: "test-results/redpeach-sites-mobile.png" });
  await page.screenshot({
    path: "test-results/redpeach-dashboard-viewport.png",
  });
});
