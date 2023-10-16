const axios = require('axios').default;
const express = require('express');
const cors = require('cors'); // Import the cors middleware
const qs = require('qs');
const router = express.Router();

const port = process.env.PORT || '9090';
const serverUrl = `http://localhost:${port}`;

let settings = {
  apiUrl: 'https://sandboxapi.deere.com/platform',
  callbackUrl: `http://localhost:3000/callback`,
  clientId: '0oaaxy2awr3xXLet55d7',
  clientSecret: '9f85Rx8-TOifQrjgI3DBaQo8PtyOnEQJgiAQTnfc6K1_U5JTly7-YDqtLJ-AtOgJ',
  orgConnectionCompletedUrl: serverUrl,
  scopes: 'openid profile offline_access ag1 eq1',
  state: 'test',
  wellKnown:
    'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/.well-known/oauth-authorization-server',
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
    state: reqBody.state,
  };
};

const updateTokenInfo = (token) => {
  settings = {
    ...settings,
    idToken: token.id_token,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    exp: token.expires_in,
  };
};

const needsOrganizationAccess = async (data) => {
  var strdata = JSON.parse(data)
  const response = (
    await axios.get(`${settings.apiUrl}/organizations`, {
      headers: {
        'Authorization': `Bearer ${strdata.access_token}`,
        'Accept': 'application/vnd.deere.axiom.v3+json',
      },
    })
  ).data;
  console.log("response", response)
  const organizations = response.values;
  console.log("organizations", organizations)
  const connectionsLink = organizations
    .flatMap((org) => org.links)
    .find((link) => link.rel === 'connections');

  if (connectionsLink) {
    const param = new URLSearchParams({
      redirect_uri: strdata.orgConnectionCompletedUrl,
    });

    // return `${connectionsLink.uri}?${param.toString()}`;

    var redirect = `${connectionsLink.uri}?${param.toString()}`

    var result = {
      'redirect': redirect,
      'response': response
    }

    return result

  } else {
    var result = {
      'redirect': redirect,
      'response': response
    }
    return result

  }
};

const app = express(); // Create an Express app
app.use(cors()); // Enable CORS for all routes

app.get("/path", (req, res, next) => {
  return res.status(200).json({
    message: "Hello from path!",
  });
});

app.post('/Test', async function ({ body }, res, next) {
  try {
    // const { body } = req;
    // populateSettings(body);
    console.log("populateSettings....", body)
    const metaData = (await axios.get(body.wellKnown)).data;
    const params = new URLSearchParams({
      client_id: body.clientId,
      response_type: 'code',
      scope: body.scopes,
      redirect_uri: body.callbackUrl,
      state: body.state
    });

    const redirectUrl = `${metaData.authorization_endpoint}?${params.toString()}`;

    res.json({ redirectUrl });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.get('/call', async function ({ query }, res, next) {
  // if (query.error) {
  //   const description = query.error_description;
  //   return res.render('error', {
  //     error: description
  //   });
  // }

  try {
    console.log("query......", query);


    const basicAuthHeader = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');

    const token = (await axios.post(metaData.token_endpoint, qs.stringify({
      grant_type: 'authorization_code',
      redirect_uri: query.redirect_uri,
      code,
      scope: settings.scopes
    }), {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuthHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })).data;

    console.log("token...", token);

    // Send the token as a JSON response
    return res.status(200).json({ token });
  }
  catch (e) {
    return res.render('error', {
      error: e
    });
  }
});

/* GET home page. */
app.get('/', function (req, res, next) {
  res.render('index', settings);
});

/* Initialize OIDC login */
app.post('/', async function ({ body }, res, next) {
  populateSettings(body);
  console.log("metaData.token_endpoint", metaData.token_endpoint)

  metaData = (await axios.get(body.wellKnown)).data;
  const params = new URLSearchParams({
    client_id: body.clientId,
    response_type: 'code',
    scope: body.scopes,
    redirect_uri: body.callbackUrl,
    state: body.state,
  });

  res.redirect(`${metaData.authorization_endpoint}?${params.toString()}`);

});

/* OIDC callback */
app.get('/callback', async function ({ query }, res, next) {
  if (query.error) {
    const description = query.error_description;
    return res.render('error', {
      error: description,
    });
  }

  try {
    const code = query.code;
    const basicAuthHeader = Buffer.from(`${query.clientId}:${query.clientSecret}`).toString(
      'base64'
    );
    console.log("query", query)
    // console.log("code", code)
    // console.log("basicAuthHeader", basicAuthHeader)
    // console.log("metaData.token_endpoint", metaData.token_endpoint)
    // console.log("Dta", qs.stringify({
    //   grant_type: 'authorization_code',
    //   redirect_uri: query.callbackUrl,
    //   code,
    //   scope: query.scopes,
    // }))


    const token = (await axios.post(query.url, qs.stringify({
      grant_type: 'authorization_code',
      redirect_uri: query.redirect_uri,
      code,
      scope: query.scope
    }), {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${basicAuthHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })).data;

    console.log("token1", token);
    var str = JSON.stringify(token)
    const organizationAccessUrl = await needsOrganizationAccess(str);
    console.log("organizationAccessUrl", organizationAccessUrl);

    // if (organizationAccessUrl) {
    //   res.redirect(organizationAccessUrl);
    // } else {
    //   res.render('index', settings);
    // }
    var data = {
      'organizationAccessUrl': organizationAccessUrl.response,
      'redirect': organizationAccessUrl.redirect,
      'token': token
    }
    console.log("data....", data)
    // Send the token as JSON response
    return res.json(data);

    // If you want to render an HTML page with the token data, you can use res.render() instead of res.json().

  } catch (e) {
    console.log("error", e)
    return res.render('error', {
      error: e,
    });
  }
});

// app.get('/proxy', async function ({ query }, res, next) {
//   console.log("url.....", query)
//   try {
//     // const response = await axios.get(body.url);
//     // res.send(response.data);

//     const response = (
//       await axios.get(query.url)
//     ).data;
//     res.json(response);
//   } catch (error) {
//     console.error(error);
//   }



// });
app.get('/refresh-access-token', async function (req, res, next) {
  try {
    const basicAuthHeader = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString(
      'base64'
    );

    const token = (
      await axios.post(
        metaData.token_endpoint,
        qs.stringify({
          grant_type: 'refresh_token',
          redirect_uri: settings.callbackUrl,
          refresh_token: settings.refreshToken,
          scope: settings.scopes,
        }),
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Basic ${basicAuthHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )
    ).data;

    updateTokenInfo(token);
    res.render('index', settings);
  } catch (e) {
    return res.render('error', {
      error: e,
    });
  }
});

app.post('/call-api', async function ({ body }, res, next) {
  console.log("body/....", body)
  try {
    const response = (
      await axios.get(body.url, {
        headers: {
          'Authorization': `Bearer ${body.accessToken}`,
          // 'Accept': 'application/vnd.deere.axiom.v3+json',
          'Accept': body.Accept,

        },
      })
    ).data;
    res.json(response);

    // res.render('index', {
    //   ...settings,
    //   apiResponse: JSON.stringify(response, null, 2),
    // });
  } catch (e) {
    console.log("e...", e)
    return res.render('error', {
      error: e,
    });
  }
});



app.post('/create-wp', async function ({ body }, res, next) {
  console.log("body/....", body.payload)
  var payloadData = body.payload
  try {
    const response = (
      await axios.post(body.url, payloadData, {
        headers: {
          'Authorization': `Bearer ${body.accessToken}`,
          'Accept': body.Accept,
          'Content-Type': 'application/vnd.deere.axiom.v3+json'

        },

      })
    ).data;
    res.json(response);

    // res.render('index', {
    //   ...settings,
    //   apiResponse: JSON.stringify(response, null, 2),
    // });
  } catch (e) {
    console.log("e...", e)
    return res.render('error', {
      error: e,
    });
  }
});

module.exports = app; // Export the Express app
