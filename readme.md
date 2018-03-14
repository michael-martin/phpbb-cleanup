## phpBB Prune Users

phpBB comes with a feature to automatically prune (delete) users and their posts. This is really useful if you've been hit by spammers in the past and want to remove their accounts.

However, the prune script times out easily if you try to delete too many users at once (More than a few hundred).

This repo automatates the process of splitting up large numbers of users to be deleted into chunks. You just set your parameters and let the automation take care of the rest.

## How does it work?

This uses [Puppeteer](https://github.com/GoogleChrome/puppeteer) to control Google Chrome. It then:

* Logs into your forum as you.
* Loads the Prune Users page in the ACP.
* Searches for users 1 day at a time.
* If too many results come back, selects to delete only the first batch (defaults 250).
* Repeats

## How to use?

Important - Backup your forum first. This script deliberately deletes data, so you definitely want a backup!

* Clone the repo
* `npm install`
* Copy the `.env.sample` file to `.env`
* Update settings there as appropriate
* `npm start`

## .env Config

| Property                   |                                  Use                                  |                Example |
| -------------------------- | :-------------------------------------------------------------------: | ---------------------: |
| FORUM_URL                  |                 Public board URL, no trailing slash.                  | https://site.com/forum |
| USERNAME                   |                            Admin username                             |               MichaelM |
| PASSWORD                   |                            Admin password                             |               p@$$w0rd |
| JOINED_BEFORE_START        |   When to start processing from (roughly when your board started?)    |             2011-01-14 |
| JOINED_BEFORE_END          | When to prune users up until (roughly a month or two ago for safety?) |             2011-03-01 |
| POST_COUNT                 |            Only delete users who have made this many posts            |                      0 |
| MAX_SIMULTANEOUS_DELETIONS |           Batch size. Lower this number if you hit errors.            |                    250 |
| HEADLESS_MODE              |       Set to false if you want to see the Chrome window running       |                   true |

## Can I use other prune parameters?

Sure, I've just added the ones I needed here.

Look in `index.js` for the `pruneUsers()` function. You'll see a few lines in where we fill in the form and how easy Puppeteer makes this. Feel free to adjust to suit your board!

## Sample Output

![alt text](https://raw.githubusercontent.com/michael-martin/phpbb-cleanup/master/sample-run.jpg "Sample run")
