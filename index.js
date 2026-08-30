const { chromium } = require("playwright");

async function runForAccount(username, password) {
  const MAX_RETRIES = 2;
  let success = false;

  console.log(`\n=== 开始处理账号: ${username} ===`);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    try {
      if (attempt > 0)
        console.log(`账号 ${username} 正在进行第 ${attempt} 次重试...`);
      console.log("正在打开页面...");

      await page.goto("https://aring.cc/awakening-of-war-soul-ol/", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // -- 登录 --
      const loginBtn = page.getByRole("button", { name: "登录", exact: true });
      const isLoginVisible = await loginBtn
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false);

      if (isLoginVisible) {
        console.log("检测到登录界面，开始登录...");
        await page
          .locator("form")
          .filter({ hasText: "登录" })
          .getByPlaceholder("请输入用户名或邮箱")
          .fill(username);
        await page
          .locator("form")
          .filter({ hasText: "登录" })
          .getByPlaceholder("请输入密码")
          .fill(password);
        await loginBtn.click();
        console.log("点击登录按钮，等待登录完成...");
      }

      // -- 检查登录状态 & 进入游戏 --
      const enterGameBtn = page.getByRole("button", {
        name: "进入游戏",
        exact: true,
      });

      const loginResult = await Promise.race([
        enterGameBtn
          .waitFor({ state: "visible", timeout: 8000 })
          .then(() => "success"),
        page
          .waitForSelector(".el-message--success .el-message__content", {
            state: "visible",
            timeout: 8000,
          })
          .then(() => "success"),
        page
          .waitForSelector(".el-message--error .el-message__content", {
            state: "visible",
            timeout: 8000,
          })
          .then(async (el) => {
            const text = await el.textContent();
            return "error: " + text;
          })
          .catch(() => "timeout"),
      ]).catch(() => "timeout");

      if (loginResult.startsWith("error:")) {
        const errorMsg = loginResult.replace("error: ", "");
        throw new Error(`登录失败: ${errorMsg}`);
      }

      const isEnterGameVisible = await enterGameBtn
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!isEnterGameVisible) {
        throw new Error("登录失败或未能进入游戏: 未能找到进入游戏按钮");
      }

      console.log("点击进入游戏...");
      await enterGameBtn.click();

      // -- 完成每日挑战 --
      console.log("尝试进入每日挑战并执行一键扫荡...");

      const copyBtn = page
        .locator("button")
        .filter({ hasText: /副本/ })
        .first();
      const isCopyVisible = await copyBtn
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false);

      if (!isCopyVisible) {
        throw new Error("未找到副本按钮，无法执行每日挑战扫荡");
      }

      console.log("点击“副本”按钮...");
      await copyBtn.click();

      const sweepBtn = page
        .locator("button")
        .filter({ hasText: /一键扫荡/ })
        .first();

      const sweepEnabled = await sweepBtn.isEnabled().catch(() => false);
      if (!sweepEnabled) {
        console.log("一键扫荡按钮已禁用，直接跳过。");
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "status_" + username + ".png" });
        console.log("账号 " + username + " 脚本执行成功！");
        success = true;
        break;
      }

      console.log("点击“一键扫荡”按钮...");
      await sweepBtn.click({ timeout: 20000 });

      const confirmSweepBtn = page
        .locator(".el-message-box__btns button")
        .filter({ hasText: /确定|确认/ })
        .first();
      const isConfirmVisible = await confirmSweepBtn
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (isConfirmVisible) {
        console.log("确认扫荡开始...");
        await confirmSweepBtn.click();
      }

      await page.waitForTimeout(1000);
      await page.screenshot({ path: "status_" + username + ".png" });

      console.log("账号 " + username + " 脚本执行成功！");
      success = true;
      break;
    } catch (error) {
      console.error(
        "账号 " +
          username +
          " 执行出错 (尝试 " +
          (attempt + 1) +
          "/" +
          (MAX_RETRIES + 1) +
          "):",
        error,
      );
      await page.screenshot({
        path: "error_" + username + "_attempt_" + attempt + ".png",
      });

      if (error.message && error.message.includes("登录失败")) {
        console.error("检测到登录失败，取消该账号后续重试。");
        await browser.close();
        break;
      }
    } finally {
      if (browser.isConnected()) {
        await browser.close();
      }
    }

    if (attempt < MAX_RETRIES) {
      console.log("等待 10 秒后进行下一次重试...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  return success;
}

(async () => {
  let accounts = [];

  const parseLines = (text) =>
    (text || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const usernames = parseLines(process.env.WARSOUL_USERNAME);
  const passwords = parseLines(process.env.WARSOUL_PASSWORD);

  if (usernames.length === 0 || passwords.length === 0) {
    console.error(
      "请设置环境变量 WARSOUL_USERNAME 和 WARSOUL_PASSWORD（支持一行一个账号）",
    );
    process.exit(1);
  }

  if (usernames.length !== passwords.length) {
    console.error(
      "WARSOUL_USERNAME 与 WARSOUL_PASSWORD 的行数不一致，请确保一行用户名对应一行密码",
    );
    process.exit(1);
  }

  for (let i = 0; i < usernames.length; i++) {
    accounts.push({
      username: usernames[i],
      password: passwords[i],
    });
  }

  console.log("检测到 " + accounts.length + " 个账号，开始串行处理...");

  let allSuccess = true;
  for (const acc of accounts) {
    const res = await runForAccount(acc.username, acc.password);
    if (!res) allSuccess = false;
  }

  if (!allSuccess) {
    console.error("\n部分账号处理失败。");
    process.exit(1);
  } else {
    console.log("\n所有账号处理完毕！");
  }
})();
