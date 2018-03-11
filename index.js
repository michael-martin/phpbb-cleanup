require("dotenv").config();
const puppeteer = require("puppeteer");

const SELECTOR_LOGIN_NAME = 'input[name="username"]';
const SELECTOR_LOGIN_PASSWORD = 'input[type="password"]';
const SELECTOR_LOGIN_SUBMIT = '#login input[type="submit"]';

const SELECTOR_ACP_NAME = 'input[name="username"]';
const SELECTOR_ACP_PASSWORD = 'input[type="password"]';
const SELECTOR_ACP_SUBMIT = '#login input[type="submit"]';

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await login(page);
  const userSid = await getQueryParam(page, "sid");
  console.log(`Logged into forum. sid: ${userSid}`);

  await loginToAdmin(page, userSid);
  console.log(`Logged into ACP.`);

  //   await browser.close();

  process.on("SIGINT", async () => {
    console.log("Closing Chrome manually.");
    try {
      await browser.close();
      process.exit();
    } catch (e) {
      console.log(e);
      process.exit();
    }
  });
})();

/**
 * Login to the forum (as a regular user)
 */
async function login(page) {
  await page.goto(`${process.env.FORUM_URL}/ucp.php?mode=login`);

  await page.click(SELECTOR_LOGIN_NAME);
  await page.keyboard.type(process.env.USERNAME);

  await page.click(SELECTOR_LOGIN_PASSWORD);
  await page.keyboard.type(process.env.PASSWORD);

  await page.click(SELECTOR_LOGIN_SUBMIT);
  return await page.waitForNavigation();
}

/**
 * Access the ACP.
 *
 * @param {*} page Puppeteer object.
 * @param {string} sid  Access token generated by phpbb after login.
 */
async function loginToAdmin(page, sid) {
  await page.goto(`${process.env.FORUM_URL}/adm/index.php?sid=${sid}`);

  await page.click(SELECTOR_ACP_PASSWORD);
  await page.keyboard.type(process.env.PASSWORD);

  await page.click(SELECTOR_ACP_SUBMIT);
  return await page.waitForNavigation();
}

/**
 * Get a query param from the current URL.
 *
 * @param {*} page Puppeteer object.
 * @param {string} name  Name of the param to retrieve.
 */
async function getQueryParam(page, name) {
  return page.$eval(
    "body",
    (body, name) => {
      const url = location.search;
      name = name.replace(/[\[\]]/g, "\\$&");
      const regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
      const results = regex.exec(url);
      if (!results) return null;
      if (!results[2]) return "";
      return decodeURIComponent(results[2].replace(/\+/g, " "));
    },
    name
  );
}
