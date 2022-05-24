const config = {
  appKey: process.env.API_KEY,
  appSecret: process.env.API_KEY_SECRET,
  accessToken: process.env.ACCESS_TOKEN,
  accessSecret: process.env.ACCESS_TOKEN_SECRET,
  meaningCloudLicenseKey: process.env.MEANING_CLOUD_LICENSE_KEY,
  twitterAccount: process.env.TWITTER_ACCOUNT,
  clientId: process.env.OAUTH2_CLIENT_ID,
  clientSecret: process.env.OAUTH2_CLIENT_SECRET,
  bearerToken: process.env.BEARER_TOKEN,
};

module.exports = config;
