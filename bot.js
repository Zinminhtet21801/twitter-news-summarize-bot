require("dotenv").config();
const needle = require("needle");
const token = process.env.BEARER_TOKEN;
const { TwitterApi } = require("twitter-api-v2");
const config = require("./config");
const twitterClient = new TwitterApi({
  appKey: config.appKey,
  appSecret: config.appSecret,
  accessToken: config.accessToken,
  accessSecret: config.accessSecret,
});

const rwClient = twitterClient.readWrite;
const rulesURL = "https://api.twitter.com/2/tweets/search/stream/rules";
const streamURL =
  "https://api.twitter.com/2/tweets/search/stream?tweet.fields=author_id,id,text&expansions=attachments.poll_ids,attachments.media_keys,author_id,geo.place_id,in_reply_to_user_id,referenced_tweets.id,entities.mentions.username,referenced_tweets.id.author_id&user.fields=id,name,username";

// this sets up two rules - the value is the search terms to match on, and the tag is an identifier that
// will be applied to the Tweets return to show which rule they matched
// with a standard project with Basic Access, you can add up to 25 concurrent rules to your stream, and
// each rule can be up to 512 characters long

// Edit rules as desired below
// const rules = [
//     {
//         'value': 'dog has:images -is:retweet',
//         'tag': 'dog pictures'
//     },
//     {
//         'value': 'cat has:images -grumpy',
//         'tag': 'cat pictures'
//     },
//     {
//         'value': 'Hello @ZinMinH99293443',
//     }
// ];

const rules = [
  {
    value: "(@ZinMinH99293443 OR ZinMinH99293443) -@twitter",
  },
];

const summarizeArticle = async (url) => {
  const formData = {
    key: config.meaningCloudLicenseKey,
    url: url,
    sentences: "3",
  };

  const res = await needle(
    "post",
    "https://api.meaningcloud.com/summarization-1.0",
    formData
  )
  return res.body.summary;
};

async function getAllRules() {
  const response = await needle("get", rulesURL, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 200) {
    console.log("Error:", response.statusMessage, response.statusCode);
    throw new Error(response.body);
  }
  console.log(response.body, "Rules Get");
  return response.body;
}

async function deleteAllRules(rules) {
  if (!Array.isArray(rules.data)) {
    return null;
  }

  const ids = rules.data.map((rule) => rule.id);

  const data = {
    delete: {
      ids: ids,
    },
  };

  const response = await needle("post", rulesURL, data, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(response.body);
  }
  console.log(response.body, "Rules Deleted");
  return response.body;
}

async function setRules() {
  const data = {
    add: rules,
  };

  const response = await needle("post", rulesURL, data, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });
  if (response.statusCode !== 201) {
    console.log(response.body.errors[0]);
    throw new Error(response.body);
  }
  console.log(response.body, "Rules Set");

  return response.body;
}

async function streamConnect(retryAttempt) {
  const stream = needle.get(streamURL, {
    headers: {
      "User-Agent": "v2FilterStreamJS",
      Authorization: `Bearer ${token}`,
    },
    timeout: 20000,
  });

  stream
    .on("data", async (datas) => {
      try {
        const json = JSON.parse(datas);
        // A successful connection resets retry count.
        retryAttempt = 0;
        console.log(json, "Stream Data");
        const [tweet] = json.includes.users;

        // get mentioned user
        const senderName = tweet.name;
        const senderTweetId = json.data.id;
        const senderMessage = json.data.text;
        console.log(
          `New mention from @${senderName} 🔔\nThey said: ${senderMessage}`
        );
        //   get original tweet
        const ogTweetId = json.data.id;
        const ogTweet = await rwClient.v1.singleTweet(ogTweetId);
        // check if original tweet contains a url
        console.log(ogTweet.entities, "entites");
        if (ogTweet.entities.urls && ogTweet.entities.urls.length > 0) {
          let articleLink = ogTweet.entities.urls[0].expanded_url;
          let articleSummary = await summarizeArticle(articleLink);
          console.log(articleSummary, "articleSummary");
          if (articleSummary) {
            // reply user
            console.log('ok dud', "articleSummary again");
            const response = await rwClient.v1.reply(
              `$@${senderName}\n${articleSummary}`,
              senderTweetId
            );
            console.log(response, "response");
          }
        }
      } catch (e) {
        if (
          datas.detail ===
          "This stream is currently at the maximum allowed connection limit."
        ) {
          console.log(datas.detail);
          process.exit(1);
        } else {
          // Keep alive signal received. Do nothing.
        }
      }
    })
    .on("err", (error) => {
      if (error.code !== "ECONNRESET") {
        console.log(error.code);
        process.exit(1);
      } else {
        // This reconnection logic will attempt to reconnect when a disconnection is detected.
        // To avoid rate limits, this logic implements exponential backoff, so the wait time
        // will increase if the client cannot reconnect to the stream.
        setTimeout(() => {
          console.warn("A connection error occurred. Reconnecting...",error);
          streamConnect(++retryAttempt);
        }, 2 ** retryAttempt);
      }
    });

  return stream;
}

(async () => {
  let currentRules;

  try {
    // Gets the complete list of rules currently applied to the stream
    currentRules = await getAllRules();
    console.log(currentRules);

    // Delete all rules. Comment the line below if you want to keep your existing rules.
    await deleteAllRules(currentRules);

    // Add rules to the stream. Comment the line below if you don't want to add new rules.
    await setRules();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  // Listen to the stream.
  streamConnect(0);
})();
