const axios = require('axios').default;
const express = require('express');
const qs = require('qs');
const cors = require('cors'); // Import the cors middleware

const router = express.Router();
const app = express(); // Create an Express app
app.use(cors()); // Enable CORS for all routes
const port = process.env.PORT || '9090';
// const serverUrl = `http://localhost:${port}`;
const serverUrl = `https://98cdvuik0g.execute-api.us-east-1.amazonaws.com`;

let settings = {
  apiUrl: 'https://sandboxapi.deere.com/platform',
  callbackUrl: `${serverUrl}/callback`,
  clientId: '0oaaxy2awr3xXLet55d7',
  clientSecret: '9f85Rx8-TOifQrjgI3DBaQo8PtyOnEQJgiAQTnfc6K1_U5JTly7-YDqtLJ-AtOgJ',
  orgConnectionCompletedUrl: serverUrl,
  scopes: 'openid profile offline_access ag1 eq1',
  state: 'test',
  wellKnown: 'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/.well-known/oauth-authorization-server'
};
let metaData = {};

const populateSettings = (reqBody) => {
  settings = {
    ...settings,
    clientId: reqBody.clientId,
    clientSecret: reqBody.clientSecret,
    wellKnown: reqBody.wellKnown,
    callbackUrl: reqBody.callbackUrl,
    scopes: reqBody.scopes,
    state: reqBody.state
  };
};

const updateTokenInfo = (token) => {
  settings = {
    ...settings,
    idToken: token.id_token,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    exp: token.expires_in
  };
}

const needsOrganizationAccess = async () => {
  const response = (await axios.get(`${settings.apiUrl}/organizations`, {
    headers: {
      'Authorization': `Bearer ${settings.accessToken}`,
      'Accept': 'application/vnd.deere.axiom.v3+json'
    }
  })).data;

  const organizations = response.values;
  const connectionsLink = organizations.flatMap((org) => org.links)
    .find((link) => link.rel === 'connections');

  if (connectionsLink) {
    const param = new URLSearchParams({
      redirect_uri: settings.orgConnectionCompletedUrl
    });

    return `${connectionsLink.uri}?${param.toString()}`;
  }
  return null;
};

/* GET home page. */
app.get('/', function (req, res, next) {
  res.render('index', settings);
});
app.get("/path", (req, res, next) => {
  return res.status(200).json({
    message: "Hello from path!",
  });
});

/* Initialize OIDC login */
app.post('/', async function ({ body }, res, next) {
  populateSettings(body);

  metaData = (await axios.get(body.wellKnown)).data;
  const params = new URLSearchParams({
    client_id: body.clientId,
    response_type: 'code',
    scope: body.scopes,
    redirect_uri: body.callbackUrl,
    state: body.state
  });

  res.redirect(`${metaData.authorization_endpoint}?${params.toString()}`)
});

/* OIDC callback */
app.get('/callback', async function ({ query }, res, next) {
  if (query.error) {
    const description = query.error_description;
    return res.render('error', {
      error: description
    });
  }

  try {
    const code = query.code;
    const basicAuthHeader = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');

    const token = (await axios.post(metaData.token_endpoint, qs.stringify({
      grant_type: 'authorization_code',
      redirect_uri: settings.callbackUrl,
      code,
      scope: settings.scopes
    }), {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuthHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })).data;

    updateTokenInfo(token);

    const organizationAccessUrl = await needsOrganizationAccess();

    if (organizationAccessUrl) {
      res.redirect(organizationAccessUrl);
    } else {
      res.render('index', settings);
    }
  } catch (e) {
    return res.render('error', {
      error: e
    });
  }
});

app.get('/refresh-access-token', async function (req, res, next) {
  try {
    const basicAuthHeader = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');

    const token = (await axios.post(metaData.token_endpoint, qs.stringify({
      grant_type: 'refresh_token',
      redirect_uri: settings.callbackUrl,
      refresh_token: settings.refreshToken,
      scope: settings.scopes
    }), {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuthHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })).data;

    updateTokenInfo(token);
    res.render('index', settings);
  } catch (e) {
    return res.render('error', {
      error: e
    });
  }
});

app.post('/call-api', async function ({ body }, res, next) {
  try {
    const response = (await axios.get(body.url, {
      headers: {
        'Authorization': `Bearer ${settings.accessToken}`,
        'Accept': 'application/vnd.deere.axiom.v3+json'
      }
    })).data;

    res.render('index', {
      ...settings,
      apiResponse: JSON.stringify(response, null, 2)
    });
  } catch (e) {
    return res.render('error', {
      error: e
    });
  }
});

module.exports = app;
