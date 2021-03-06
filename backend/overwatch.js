var ping = require("jjg-ping");
var axios = require("axios");

const sessionStartTime = new Date();
const sessionId = {}; // Database ID for the current session and its associated IP Addresses

var hosts = [];
var sessionsData = {}; // Local storage of some session data
var packetsSent = 0;
var isNewSession = true;

// Get hosts from database
async function getHosts() {
  const response = await axios.get("http://localhost:3001/api/hosts");

  for (let i = 0; i < response.data.length; i++) {
    hosts.push(response.data[i].ipAddress);
  }
}

// Save a session to a database
async function saveSessionToDB(loss, total, avg, ip) {
  const data = {
    ipAddress: ip,

    startTime: sessionStartTime,
    endTime: new Date(),

    packetLoss: loss,
    totalPackets: total,
    averageLatency: avg
  };

  // If session just started, create a new document in Database, otherwise update the existing one
  if (isNewSession) {
    const response = await axios.post(
      "http://localhost:3001/api/sessions",
      data
    );

    sessionId[ip] = response.data["_id"];
  } else {
    const response = await axios.put(
      `http://localhost:3001/api/sessions/${sessionId[ip]}`,
      data
    );
  }
}

// Ping the provided IP Address
const getLatency = function(host) {
  return new Promise((resolve, reject) => {
    ping.system.ping(host, function(latency, status) {
      if (status) {
        resolve(latency);
      } else {
        reject(latency);
      }
    });
  });
};

// Manipulate provided session data into something valid for the database
function prepareData(packets, ip, total) {
  var avg = 0;
  var loss = 0;
  var successes = 0;

  if (ip in sessionsData) {
    avg = sessionsData[ip].avg;
    loss = sessionsData[ip].loss;
    successes = sessionsData[ip].successes;
  } else {
    sessionsData[ip] = {};
  }

  for (let i = 0; i < packets.length; i++) {
    if (packets[i] != -1) {
      successes += 1;
      avg += (packets[i] - avg) / successes;
    } else {
      loss += 1;
    }
  }

  sessionsData[ip].avg = avg;
  sessionsData[ip].loss = loss;
  sessionsData[ip].successes = successes;

  return [loss, total, avg, ip];
}

// Coordinate calls for getLatency and saveSessionToDB
async function managePings(hosts, timesToPing) {
  let responses = {};

  // Create and empty list to store packets gather for each host
  for (let i = 0; i < hosts.length; i++) {
    responses[hosts[i]] = [];
  }

  for (let i = 0; i < timesToPing; i++) {
    for (let j = 0; j < hosts.length; j++) {
      try {
        const response = await getLatency(hosts[j]);
        responses[hosts[j]].push(response);
      } catch (err) {
        responses[hosts[j]].push(-1); // -1 represents a failed attempt to ping
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }

  packetsSent += timesToPing;
  // console.log(packetsSent);
  for (let i = 0; i < hosts.length; i++) {
    try {
      const response = await saveSessionToDB(
        ...prepareData(responses[hosts[i]], hosts[i], packetsSent)
      );
    } catch (error) {
      console.log(error);
    }
  }
  isNewSession = false;
}

// Not sure it needs a comment
async function main() {
  await getHosts();
  console.log(`Pinging to ${hosts}`);

  while (1) {
    await managePings(hosts, 30);
    // console.log("Gas Gas Gas");
    // console.log(sessionId);
  }
}

main();
