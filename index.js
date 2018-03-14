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
const maxSimultaneousDeletions = parseInt(
  process.env.MAX_SIMULTANEOUS_DELETIONS,
  10
);
const headlessMode = process.env.HEADLESS_MODE === "true";

(async () => {
  const browser = await puppeteer.launch({ headless: headlessMode });
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

  return await clickToSubmit(page, SELECTORS.LOGIN_SUBMIT);
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

  await clickToSubmit(page, SELECTORS.ACP_SUBMIT);
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
      retryCounter = 0; // Reset counter on success.

      // Did we delete all users for today? Or were we limited by the batch size? (i.e. call today again)
      if (deleted !== maxSimultaneousDeletions) {
        currentDate = addDays(currentDate, 1);
      }
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
  await page.keyboard.type(process.env.POST_COUNT);

  await page.click(SELECTORS.DELETE_POSTS);
  await page.click(SELECTORS.DELETE_USERS);

  await clickToSubmit(page, SELECTORS.PRUNE_SUBMIT);

  // If no users matched the query, there is nothing to do.
  const error = await page.$(SELECTORS.ERROR_BOX);
  if (error) {
    console.log("No users to delete.");
    return 0;
  }

  // How many users will be deleted?
  await page.waitForSelector(SELECTORS.PRUNE_USER_RESULTS);
  const usersToDelete = await page.$$(SELECTORS.PRUNE_USER_RESULTS);
  let numberToDelete = usersToDelete.length;

  // Are there more results than we can delete in 1 batch?
  // If so, de-select any past the batch limit.
  if (numberToDelete > maxSimultaneousDeletions) {
    for (let i = maxSimultaneousDeletions; i < usersToDelete.length; i++) {
      await usersToDelete[i].click();
    }
    numberToDelete = maxSimultaneousDeletions;
  }
  console.log(`Deleting ${numberToDelete} users`);

  // Confirm.
  try {
    await clickToSubmit(page, SELECTORS.PRUNE_CONFIRM_SUBMIT);
    const success = await page.$(SELECTORS.SUCCESS_BOX);
    if (!success) {
      throw "Deletion failed.";
    }
  } catch (e) {
    throw "Failed to submit deletion form.";
  }

  return numberToDelete;
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

/**
 * Click to submit a form and wait for navigation to succeed.
 *
 * @param {*} page Puppeteer object.
 * @param {string} selector     Selector for the button to clicl.
 */
async function clickToSubmit(page, selector) {
  await page.waitForSelector(selector);
  return await Promise.all([
    page.waitForNavigation({
      timeout: navigationTimeout
    }),
    page.click(selector)
  ]);
}
