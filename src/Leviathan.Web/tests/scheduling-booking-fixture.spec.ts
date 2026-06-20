import { expect, test } from "@playwright/test";

test("fixture public booking still supports date and slot selection with the shadcn calendar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/book/demo-provider?fixture=public-booking");

  const calendar = page.locator("[data-slot='calendar']");
  await expect(calendar).toBeVisible();

  await page.getByRole("tab", { name: "45m" }).click();
  await calendar.getByRole("button", { name: "Thursday, May 15th, 2025" }).click();
  await expect(page.getByText("Thursday, May 15")).toBeVisible();

  await page.getByTestId("public-slot-option").first().click();
  await expect(page.getByTestId("public-selected-slot")).toBeVisible();
  await expect(page.getByText("Save details")).toBeVisible();
});
