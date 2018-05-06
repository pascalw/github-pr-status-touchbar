const fetch = require("node-fetch");
const { ApolloLink } = require("apollo-link");
const { ApolloClient } = require("apollo-client");
const { setContext } = require("apollo-link-context");
const { createHttpLink } = require("apollo-link-http");
const { InMemoryCache } = require("apollo-cache-inmemory");
const gql = require("graphql-tag");

const buildClient = (token) => {
  const httpLink = createHttpLink({
    uri: "https://api.github.com/graphql",
    fetch: fetch
  });

  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers,
        authorization: `bearer ${token}`
      }
    }
  });

  return new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache()
  });
};


const mapPr = (data) => {
  return {
    number: data["number"],
    updatedAt: data["updatedAt"],
    status: data["commits"]["nodes"][0]["commit"]["status"]["state"]
  };
};

const recently = (now) => (pr) => {
  return pr.updatedAt <= now + (15 * 60);
};

const getRecentPRs = async (user, client) => {
  const result = await client
    .query({ query: gql`
    {
      user(login: "${user}") {
        pullRequests(first: 3, states: OPEN, orderBy: {direction: DESC, field: UPDATED_AT}) {
          nodes {
            number
            updatedAt
            commits(last: 1) {
              nodes {
                commit {
                  status {
                    state
                  }
                }
              }
            }
          }
        }
      }
    }
    `
    });

  const now = Date.now();

  const prs = result["data"]["user"]["pullRequests"]["nodes"];
  return prs.filter(recently(now)).map(mapPr);
};

const statusIcon = (pr) => {
  switch(pr.status) {
    case "SUCCESS": 
      return "✅";
    case "PENDING":
      return "🕐";
    default:
      return "❌";
  }
};

const format = (pr) => `#${pr.number} ${statusIcon(pr)}`;

const run = async (options) => {
  try {
    const client = buildClient(options.token);
    const prs = await getRecentPRs(options.user, client);

    if(prs.length > 0) {
      console.log(prs.map(format).join(' '));
    }
  } catch (e) {
    // ignore unless DEBUG is enabled, we don't want garbage in the touchbar :-)
    if(process.env.DEBUG) {
      console.error(e);
    }

    process.exit(1);
  }
};

const { ArgumentParser } = require("argparse")
const parser = new ArgumentParser({
  addHelp: true
});

parser.addArgument(["-u", "--user"], { required: true });
parser.addArgument(["-t", "--token"], { required: true });

const options = parser.parseArgs();
run(options);
