const SELECTORS = {
  LOGIN_NAME: 'input[name="username"]',
  LOGIN_PASSWORD: 'input[type="password"]',
  LOGIN_SUBMIT: '#login input[type="submit"]',

  ACP_NAME: 'input[name="username"]',
  ACP_PASSWORD: 'input[type="password"]',
  ACP_SUBMIT: '#login input[type="submit"]',

  JOINED_BEFORE: "#joined_before",
  POST_COUNT: "#count",
  DELETE_POSTS: 'input[name="deleteposts"][value="1"]',
  DELETE_USERS: 'input[name="action"][value="delete"]',

  ERROR_BOX: ".errorbox",
  SUCCESS_BOX: ".successbox",

  PRUNE_USER_RESULTS: 'input[name="user_ids[]"]',
  PRUNE_SUBMIT: '#acp_prune input[type="submit"][name="update"]',
  PRUNE_CONFIRM_SUBMIT: '#confirm input[type="submit"][name="confirm"]'
};

module.exports = SELECTORS;
