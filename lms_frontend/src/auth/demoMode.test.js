import { DEMO_ACCOUNTS, findDemoAccount } from "./demoMode";

describe("demoMode findDemoAccount()", () => {
  test("matches the admin demo credentials exactly (case-sensitive) and ignores surrounding whitespace", () => {
    const admin = DEMO_ACCOUNTS.find((a) => a.role === "admin");
    expect(admin).toBeTruthy();
    expect(admin.email).toBe("admin@demo.lms");
    expect(admin.password).toBe("Admin!234");

    // Surrounding whitespace should not matter.
    expect(findDemoAccount("  admin@demo.lms ", "Admin!234")).toEqual(admin);

    // Case changes should fail (exact match required).
    expect(findDemoAccount("Admin@demo.lms", "Admin!234")).toBeNull();
    expect(findDemoAccount("admin@demo.lms", "admin!234")).toBeNull();
  });
});
