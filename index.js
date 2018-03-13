require("dotenv").config();
const puppeteer = require("puppeteer");
const SELECTORS = require("./selectors");
const parse = require("date-fns/parse");
const isValid = require("date-fns/is_valid");
const isBefore = require("date-fns/is_before");
const format = require("date-fns/format");
const addDays = require("date-fns/add_days");

const dateFormat = "YYYY-MM-DD";
const maxRetries = 3;
const navigationTimeout = 180000; // ms

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await login(page);
  const userSid = await getQueryParam(page, "sid");
  console.log(`Logged into forum. sid: ${userSid}`);

  await loginToAdmin(page, userSid);
  const adminSid = await getQueryParam(page, "sid");
  console.log(`Logged into ACP. sid: ${adminSid}`);

  const joinedFrom = parse(process.env.JOINED_BEFORE_START);
  const joinedEnd = parse(process.env.JOINED_BEFORE_END);
  const totalDeleted = await loopPruneUsers(
    page,
    adminSid,
    joinedFrom,
    joinedEnd
  );

  console.log(`Done! Deleted ${totalDeleted} users.`);
  await browser.close();

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

  await page.click(SELECTORS.LOGIN_NAME);
  await page.keyboard.type(process.env.USERNAME);

  await page.click(SELECTORS.LOGIN_PASSWORD);
  await page.keyboard.type(process.env.PASSWORD);

  await page.click(SELECTORS.LOGIN_SUBMIT);
  return await page.waitForNavigation();
}

/**
 * Access the ACP.
 *
 * @param {*} page Puppeteer object.
 * @param {string} sid  Access token generated by phpbb after login.
 */
async function loginToAdmin(page, sid) {
  await page.goto(`${process.env.FORUM_URL}/adm/index.php?sid=${sid}`, {
    timeout: 60000
  });

  await page.click(SELECTORS.ACP_PASSWORD);
  await page.keyboard.type(process.env.PASSWORD);

  await page.click(SELECTORS.ACP_SUBMIT);
  return await page.waitForNavigation();
}

/**
 * Repeatedly submit the "Prune" form for each day between the given range.
 *
 * @param {*} page Puppeteer object.
 * @param {string} sid  Admin access token generated by phpbb after ACP login.
 * @param {Date} startDate   First "Joined Before" date to start with.
 * @param {Date} endDate     Final "Joined Before" date to end with (i.e. no users who joined after this will be deleted)
 */
async function loopPruneUsers(page, sid, startDate, endDate) {
  if (!isValid(startDate) || !isValid(endDate)) {
    return console.error(
      "Your joined from start or end dates were invalid. Quitting."
    );
  }

  if (!isBefore(startDate, endDate)) {
    return console.error(
      "Your joined from start date must be before the end date. Quitting."
    );
  }

  console.log(`Ready to prune users.`);
  console.log(`Joined from: ${startDate}`);
  console.log(`Joined to: ${endDate}`);
  console.log("----------");

  let currentDate = startDate;
  let totalDeleted = 0;
  let retryCounter = 0; // Prevent infinite retry loops.

  while (isBefore(currentDate, endDate) && retryCounter < maxRetries) {
    try {
      let deleted = await pruneUsers(page, sid, currentDate);
      totalDeleted += deleted;
      currentDate = addDays(currentDate, 1);
      retryCounter = 0; // Reset counter on success.
    } catch (e) {
      console.log(e);
      console.log(`Prune failed. Re-trying for ${currentDate}`);
      retryCounter++;
    }
  }

  return totalDeleted;
}

/**
 * Start the user prune process.
 *
 * @param {*} page Puppeteer object.
 * @param {string} sid  Admin access token generated by phpbb after ACP login.
 * @returns {number} Of users deleted.
 */
async function pruneUsers(page, sid, date) {
  await page.goto(
    `${process.env.FORUM_URL}/adm/index.php?sid=${sid}&i=acp_prune&mode=users`
  );

  const joinedBeforeValue = format(date, dateFormat);
  console.log(
    `Preparing to prune users who joined before: ${joinedBeforeValue}`
  );

  await page.click(SELECTORS.JOINED_BEFORE);
  await page.keyboard.type(joinedBeforeValue);

  await page.click(SELECTORS.POST_COUNT);
  await page.keyboard.type("0");

  await page.click(SELECTORS.DELETE_POSTS);
  await page.click(SELECTORS.DELETE_USERS);

  await page.click(SELECTORS.PRUNE_SUBMIT);
  await page.waitForNavigation({
    timeout: navigationTimeout
  });

  // Browser seems to take time to draw the full list of options sometimes, and waitForSelector doesn't resolve them.
  // Timer is a quick hack to work around.
  await new Promise(resolve => setTimeout(resolve, 4000));

  // If no users matched the query, there is nothing to do.
  const error = await page.$(SELECTORS.ERROR_BOX);
  if (error) {
    console.log("No users to delete.");
    return 0;
  }

  // Log how many users will be deleted.
  await page.waitForSelector(SELECTORS.PRUNE_USER_RESULTS);
  const toDelete = await page.$$(SELECTORS.PRUNE_USER_RESULTS);
  console.log(`Deleting ${toDelete.length} users`);

  // Confirm.
  try {
    await page.waitForSelector(SELECTORS.PRUNE_CONFIRM_SUBMIT);
    await page.click(SELECTORS.PRUNE_CONFIRM_SUBMIT);

    await page.waitForNavigation({
      timeout: navigationTimeout
    });
  } catch (e) {
    throw "Failed to submit deletion form.";
  }

  return toDelete.length;
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
