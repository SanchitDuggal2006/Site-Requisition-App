import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("login, dashboard and report have no automated WCAG AA violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const check = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  };
  await check();
  await page.getByLabel("Mobile number").fill("9000000000");
  await page.getByLabel("Six-digit PIN").fill("681429");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "↓ Refresh" })).toBeVisible();
  await check();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Daily report" }),
  ).toBeVisible();
  await check();
});
