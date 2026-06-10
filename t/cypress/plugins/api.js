// Thin Koha REST API client used for test setup ( patrons, items, biblios,
// holds, checkouts, recalls ). Mirrors Koha's own t/cypress/plugins/api-client.
// Registered as the cy.task("apiGet"/"apiPost"/"apiPut"/"apiDelete") tasks in
// cypress.config.js, which inject baseUrl and the basic-auth credentials.

function authHeader(user, pass) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

async function request({ method, endpoint, body, contentType, baseUrl, user, pass }) {
  // A string body is sent as-is ( e.g. MARCXML for biblio creation ); anything
  // else is JSON-encoded.
  const isString = typeof body === "string";
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      "Content-Type": contentType || "application/json",
      Authorization: authHeader(user, pass),
    },
    body: body == null ? undefined : isString ? body : JSON.stringify(body),
  });

  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    // leave data as the raw text
  }

  if (response.status >= 400) {
    throw new Error(
      `API ${method} ${endpoint} -> ${response.status}: ${text}`
    );
  }

  return data;
}

const apiGet = args => request({ ...args, method: "GET" });
const apiPost = args => request({ ...args, method: "POST" });
const apiPut = args => request({ ...args, method: "PUT" });
const apiDelete = args => request({ ...args, method: "DELETE" });

module.exports = { apiGet, apiPost, apiPut, apiDelete };
