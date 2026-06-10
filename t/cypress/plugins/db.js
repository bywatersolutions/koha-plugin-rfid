// Direct database access for test setup, used for state the REST API does not
// expose ( system preferences, item type checkin messages, item flags, fines ).
// Mirrors Koha's own t/cypress/plugins/db.js. Registered as the cy.task("query")
// task in cypress.config.js.
//
// Connection defaults target koha-testing-docker started with --local-db, which
// publishes MySQL on the host. Override with DB_HOSTNAME / DB_PORT / DB_USER /
// DB_PASSWORD / DB_NAME.

const mysql = require("mysql2/promise");

const connectionConfig = {
  host: process.env.DB_HOSTNAME || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "koha_kohadev",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "koha_kohadev",
};

// Run a parameterized query and return the rows. Opens and closes a connection
// per call so a long suite never holds an idle connection.
async function query({ sql, values = [] }) {
  const connection = await mysql.createConnection(connectionConfig);
  try {
    const [rows] = await connection.execute(sql, values);
    return rows;
  } finally {
    await connection.end();
  }
}

module.exports = { query };
