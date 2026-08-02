import express from "express";

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get("/authorize", (request, response) => {
  const redirect = new URL(request.query.redirect_uri);
  redirect.searchParams.set("code", "fixture-authorization-code");
  redirect.searchParams.set("state", request.query.state);
  response.redirect(302, redirect.toString());
});

app.post("/token", (request, response) => {
  response.json({
    access_token: request.body.grant_type === "refresh_token" ? "fixture-refreshed-access-token" : "fixture-access-token",
    refresh_token: "fixture-refresh-token",
    expires_in: 3600,
    token_type: "Bearer",
    scope: "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.events"
  });
});

app.get("/userinfo", (_request, response) => {
  response.json({ sub: "fixture-google-account", email: "oauth-user@example.test", email_verified: true, name: "OAuth Test User" });
});

app.post("/revoke", (_request, response) => response.status(200).end());

const port = Number(process.env.OAUTH_FIXTURE_PORT || 43174);
app.listen(port, "127.0.0.1", () => console.log(`OAuth fixture listening on ${port}`));
