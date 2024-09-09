# decai-fe

Open Sourced Decentralized AI Frontend Demo

# how to run

1. create a .env file with the following contents

```
REACT_APP_AUTH0_DOMAIN=<secret>
REACT_APP_AUTH0_CLIENT_ID=<secret>
REACT_APP_BACKEND_DOMAIN=<secret>
REACT_APP_AUTH0_LOGOUT_REDIRECT_URI=<secret>
```

2. `npm ci` then `npm start`

# tech stack

material UI
TypeScript
React

# visualization

We will use [reactflow](https://reactflow.dev/) for visualiztion.

functional requirements:

- Show stats such as total number of nodes, models trained so far etc.
- Display the network logs about who is interacting with who

The network data will roughly be in this format

```
interface CommunicationGraphSingleRound {
    nodes: Array<{ id: string }>;
    links: Array<{ source: string, target: string }>;
}

interface CommunicationGraphMultipleRounds {
    [key: string]: CommunicationGraphSingleRound;
}
```

If we translate it to the JSON format that is consumable by the frontend, it looks like this.

Example 1: Single Round Communication Graph `CommunicationGraphSingleRound`

```js
const SingleRound1 = {
  nodes: [{ id: "user1" }, { id: "user2" }, { id: "user3" }],
  links: [
    { source: "user1", target: "user2" },
    { source: "user2", target: "user3" },
  ],
};
```

Example 2: Multiple Rounds Communication Graph `CommunicationGraphMultipleRounds`

```js
const MultipleRounds = {
  round1: SingleRound1,
  round2: SingleRound2,
};
```

i.e. it looks like this

```js
const MultipleRounds = {
  round1: {
    nodes: [{ id: "userA" }, { id: "userB" }, { id: "userC" }],
    links: [
      { source: "userA", target: "userB" },
      { source: "userB", target: "userC" },
    ],
  },
  round2: {
    nodes: [{ id: "userD" }, { id: "userE" }],
    links: [{ source: "userD", target: "userE" }],
  },
};
```
