require("dotenv").config();
const cors = require("cors");
const redis = require("redis");

const SpotifyWebApi = require("spotify-web-api-node");
const lyricsFinder = require("lyrics-finder");
const { DateTime } = require("luxon");

const pool = require("../db.js");

let client;

(async () => {
  const url = `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;

  client = redis.createClient({
    url,
    password: process.env.REDIS_PASSWORD,
    // password: "password"
  });


  client.on("error", (err) => console.log("Redis Client Error", err));

  await client.connect();
})();

async function test2(req, res) {
  const { userId, duration } = req.query;
  const value = await client.get(
    JSON.stringify({ method: req.method, url: req.url })
  );
  const obj = JSON.parse(value);
  if (obj !== null) {
    console.log(obj);

    res.send(obj);
  } else {
    await client.set(
      JSON.stringify({ method: req.method, url: req.url }),
      JSON.stringify({ res: "test2" }),
      {
        EX: 30,
      }
    );
    res.json({ res: "complete" });
  }
}

function getSpotifyInfo(req, res) {
  res.json({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    redirect: process.env.REDIRECT_URI,
  });
}

function refreshAccess(req, res) {
  //   console.log(req);
  const refreshToken = req.body.refreshToken;
  const spotifyApi = new SpotifyWebApi({
    redirectUri: process.env.REDIRECT_URI,
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    refreshToken,
  });

  spotifyApi
    .refreshAccessToken()
    .then((data) => {
      // console.log(data.body);
    })
    .catch(() => {
      res.sendStatus(400);
    });
}

function loginSpotify(req, res) {
  //   console.log(req);
  const code = req.body.code;
  const spotifyApi = new SpotifyWebApi({
    redirectUri: process.env.REDIRECT_URI,
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  spotifyApi
    .authorizationCodeGrant(code)
    .then((data) => {
      // use this to test loading spinner
      // setTimeout(() => {
      //   res.json({
      //     accessToken: data.body.access_token,
      //     refreshToken: data.body.refresh_token,
      //     expiresIn: data.body.expires_in_in,
      //   });
      // }, 2000);
      res.json({
        accessToken: data.body.access_token,
        refreshToken: data.body.refresh_token,
        expiresIn: data.body.expires_in_in,
      });
    })
    .catch((error) => {
      console.log(error);
      res.sendStatus(400);
    });
}

async function getLyrics(req, res) {
  // console.log(req);
  const lyrics =
    (await lyricsFinder(req.query.artists, req.query.track)) ||
    "No Lyrics Found";
  res.json({ lyrics });
}

async function getArtists(req, res) {
  const { userId, duration } = req.query;
  // console.log(userId);

  try {
    const redisKey = JSON.stringify({
      url: req.url,
      method: req.method,
      userId: userId,
      duration: duration,
    });
    const cacheResults = await client.get(redisKey);
    // console.log(cacheResults);
    if (cacheResults && cacheResults.length !== 0) {
      const obj = JSON.parse(cacheResults);
      res.json(obj);
    } else {
      // console.log("talking to database");
      const query = await pool.query(
        "SELECT * FROM artists WHERE user_id = $1 AND duration = $2 AND created_at = $3",
        [userId, duration, getCurrentDate()]
      );
      // console.log(query.rows);

      res.json(query.rows);
      await client.set(redisKey, JSON.stringify(query.rows), {
        EX: 7200,
      });
    }
  } catch (err) {
    console.log(err.message);
  }
}

async function getArtistsRankChange(req, res) {
  const { userId, duration } = req.query;

  try {
    const redisKey = JSON.stringify({
      url: req.url,
      method: req.method,
      userId: userId,
      duration: duration,
    });
    const cacheResults = await client.get(redisKey);

    if (cacheResults) {
      const obj = JSON.parse(cacheResults);
      // console.log(cacheResults);
      res.json(obj);
    } else {
      const query = await pool.query(
        "SELECT * FROM artists WHERE user_id = $1 AND duration = $2 ORDER BY created_at DESC LIMIT 2",
        [userId, duration]
      );
      // console.log(query.rows);
      if (query.rows.length > 1) {
        let map = new Map();

        for (let i = 0; i < query.rows[1].artists.length; i++) {
          map.set(query.rows[1].artists[i], i + 1);
        }
        // console.log(map);

        let changeArray = query.rows[0].artists.map((artist, index) => {
          // console.log(artist);
          if (map.has(artist) == false) {
            return "new";
          } else if (map.get(artist) > index + 1) {
            return "higher";
          } else if (map.get(artist) < index + 1) {
            return "lower";
          } else {
            return "same";
          }
        });
        // console.log(changeArray);
        res.json(changeArray);
        await client.set(redisKey, JSON.stringify(changeArray), {
          EX: 7200,
        });
      } else {
        res.sendStatus(204);
      }
    }
  } catch (err) {
    console.log(err.message);
  }
}

async function getTracks(req, res) {
  const { userId, duration } = req.query;

  try {
    const redisKey = JSON.stringify({
      url: req.url,
      method: req.method,
      userId: userId,
      duration: duration,
    });
    const cacheResults = await client.get(redisKey);

    if (cacheResults) {
      const obj = JSON.parse(cacheResults);
      res.json(obj);
    } else {
      const query = await pool.query(
        "SELECT * FROM tracks WHERE user_id = $1 AND duration = $2 AND created_at = $3",
        [userId, duration, getCurrentDate()]
      );
      res.json(query.rows);
      await client.set(redisKey, JSON.stringify(query.rows), {
        EX: 7200,
      });
    }
  } catch (err) {
    console.log(err.message);
  }
}

async function getTracksRankChange(req, res) {
  const { userId, duration } = req.query;

  try {
    const redisKey = JSON.stringify({
      url: req.url,
      method: req.method,
      userId: userId,
      duration: duration,
    });
    const cacheResults = await client.get(redisKey);

    if (cacheResults) {
      const obj = JSON.parse(cacheResults);
      res.json(obj);
    } else {
      const query = await pool.query(
        "SELECT * FROM tracks WHERE user_id = $1 AND duration = $2 ORDER BY created_at DESC LIMIT 2",
        [userId, duration]
      );

      // console.log(query.rows);
      if (query.rows.length > 1) {
        let map = new Map();
        for (let i = 0; i < query.rows[1].tracks.length; i++) {
          map.set(query.rows[1].tracks[i], i + 1);
        }
        // console.log(map);

        let changeArray = query.rows[0].tracks.map((tracks, index) => {
          if (map.has(tracks) == false) {
            return "new";
          } else if (map.get(tracks) > index + 1) {
            return "higher";
          } else if (map.get(tracks) < index + 1) {
            return "lower";
          } else {
            return "same";
          }
        });
        // console.log(changeArray);
        res.json(changeArray);
        await client.set(redisKey, JSON.stringify(changeArray), {
          EX: 7200,
        });
      } else {
        res.sendStatus(204);
      }
    }
  } catch (err) {
    console.log(err.message);
  }
}

async function getGenres(req, res) {
  const { userId, duration } = req.query;
  try {
    const redisKey = JSON.stringify({
      url: req.url,
      method: req.method,
      userId: userId,
      duration: duration,
    });
    const cacheResults = await client.get(redisKey);
    // console.log(cacheResults);

    if (cacheResults) {
      const obj = JSON.parse(cacheResults);
      res.json(obj);
    } else {
      const query = await pool.query(
        "SELECT * FROM genres WHERE user_id = $1 AND duration = $2 AND created_at = $3",
        [userId, duration, getCurrentDate()]
      );
      // console.log(query);
      res.json(query.rows[0]);
      await client.set(redisKey, JSON.stringify(query.rows[0]), {
        EX: 7200,
      });
    }
  } catch (err) {
    console.log(err.message);
  }
}

async function getTimeListenedToday(req, res) {
  const { userId } = req.query;

  let currentDate = new Date().toISOString().split("T")[0];
  try {
    const query = await pool.query(
      "SELECT tracks FROM recent_tracks WHERE user_id = $1 AND calendar_date = $2",
      [userId, getCurrentDate()]
    );
    // console.log(query.rows);
    let total = 0;
    query.rows.forEach((row) => {
      row.tracks.forEach((track) => {
        let obj = JSON.parse(track);
        total += obj.duration;
      });
    });

    res.json({ duration: total });
  } catch (error) {
    console.log(error.message);
  }
}

async function updateListeningHistory(req, res) {
  const { userId } = req.query;

  try {
    // first check if listening history is already there
    const listeningHistoryQuery = await pool.query(
      "SELECT FROM listening_history WHERE user_id = $1 AND created_at = $2",
      [userId, getYesterdayDate()]
    );

    // console.log(listeningHistoryQuery.rows);

    if (listeningHistoryQuery.rows.length == 0) {
      // go through yesterday's tracks and figure out what the final number is then add it to listening history database
      // console.log("listening history");

      const recentTracksQuery = await pool.query(
        "SELECT tracks FROM recent_tracks WHERE user_id = $1 AND calendar_date = $2",
        [userId, getYesterdayDate()]
      );

      const recentTracksQuery2 = await pool.query(
        "SELECT tracks FROM recent_tracks WHERE user_id = $1 AND calendar_date = $2",
        [userId, getCurrentDate()]
      );

      let total = 0;
      if (recentTracksQuery.rows.length > 0) {
        recentTracksQuery.rows.forEach((row) => {
          row.tracks.forEach((track) => {
            let obj = JSON.parse(track);
            total += obj.duration;
          });
        });
      }

      async function updateDatabase(duration, date) {
        const updateQuery = await pool.query(
          "INSERT INTO listening_history(duration,user_id, calendar_date) VALUES ($1, $2, $3) RETURNING *",
          [duration, userId, date]
        );
      }

      async function deleteYesterdayEntries(date) {
        const deleteQuery = await pool.query(
          "DELETE FROM recent_tracks WHERE user_id = $1 AND calendar_date = $2",
          [userId, date]
        );
      }
      getYesterdayDate();

      if (total > 0) {
        console.log(total);
        updateDatabase(total, getYesterdayDate());
        deleteYesterdayEntries(getYesterdayDate());
        console.log("deleted tracks");
      }
    }
  } catch (error) {
    console.log(error.message);
  } finally {
    res.sendStatus(200);
  }
}

async function getListeningHistory(req, res) {
  const { userId } = req.query;

  try {
    const redisKey = JSON.stringify({
      url: req.url,
      method: req.method,
      userId: userId,
    });
    const cacheResults = await client.get(redisKey);
    if (cacheResults && cacheResults.length !== 0) {
      const obj = JSON.parse(cacheResults);
      res.json(obj);
    } else {
      // first check if listening history is already there
      const listeningHistoryQuery = await pool.query(
        "SELECT duration, calendar_date FROM listening_history WHERE user_id = $1 ",
        [userId]
      );

      // console.log(listeningHistoryQuery.rows);

      res.json(listeningHistoryQuery.rows);

      await client.set(redisKey, JSON.stringify(listeningHistoryQuery.rows), {
        EX: 7200,
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function createArtists(req, res) {
  const { artists, genres, albums, duration, userId } = req.body.params;
  let topGenres = [];

  // check if the entry already exists for the specific duration
  try {
    const query = await pool.query(
      "SELECT * FROM artists WHERE user_id = $1 AND duration = $2 AND created_at = $3",
      [userId, duration, getCurrentDate()]
    );
    // console.log(query.rows);
    if (query.rows.length > 0) {
      res.sendStatus(200);
      return;
    }
  } catch (err) {
    console.log(err.message);
  }

  // insert into artists table
  try {
    // console.log("adding to artists table");
    const query = await pool.query(
      "INSERT INTO artists(artists, genres, albums, user_id, duration,created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [artists, genres, albums, userId, duration, getCurrentDate()]
    );
    topGenres = sortTopGenres(query.rows[0].genres);
  } catch (err) {
    console.log(err.message);
  }

  // insert into genres table
  try {
    const saveToDatabase = await pool.query(
      "INSERT INTO genres(genres, user_id, duration, created_at) VALUES ($1, $2, $3, $4) RETURNING *",
      [topGenres, userId, duration, getCurrentDate()]
    );
    res.sendStatus(200);
  } catch (err) {
    console.log(err.message);
  }
}

async function addRecentTracks(req, res) {
  const { recent_tracks, userId } = req.body.params;
  let todayUpdate = [];
  let yesterdayUpdate = [];

  try {
    // this will grab the newest database entry
    const query = await pool.query(
      "SELECT * FROM recent_tracks WHERE user_id = $1 AND calendar_date = $2 ORDER BY created_at DESC LIMIT 1",
      [userId, getCurrentDate()]
    );
    // console.log("latest track from today");
    // console.log(query.rows[0]);

    const listeningHistoryQuery = await pool.query(
      "SELECT duration, calendar_date FROM listening_history WHERE user_id = $1 AND calendar_date = $2",
      [userId, getYesterdayDate()]
    );

    let query2 = [];

    if (listeningHistoryQuery.rows.length == 0) {
      query2 = await pool.query(
        "SELECT * FROM recent_tracks WHERE user_id = $1 AND calendar_date = $2 ORDER BY created_at DESC LIMIT 1",
        [userId, getYesterdayDate()]
      );
      // console.log("latest track from yesterday");
      // console.log(query2.rows[0]);
    } else {
      // console.log("already have listening history for yesterday");
    }

    // there can be multiple tracks per entry
    // If our database is empty, add to our update the tracks for today and yesterday
    function addToUpdateArray(query, date, updateArray) {
      if (query.rows.length == 0) {
        for (let i = recent_tracks.length - 1; i >= 0; i--) {
          if (recent_tracks[i].date.slice(0, 10) == date) {
            // console.log(i);
            updateArray.push(recent_tracks[i]);
          }
        }
        return;
      }

      // it comes back as a string so use JSON parse to put it back as an object
      // add any entries newer than our last entry into the update array
      const latestLength = query.rows[0].tracks.length;
      // console.log("length" + length);
      const latestEntry = JSON.parse(query.rows[0].tracks[latestLength - 1]);
      // console.log("latest entry date " + latestEntry.date);

      let latestDate = query.rows[0].calendar_date;
      // console.log(latestDate);
      let latestTimestamp = convertToTimestamp(latestEntry.date);
      for (let i = recent_tracks.length - 1; i >= 0; i--) {
        if (recent_tracks[i].date.slice(0, 10) == latestDate) {
          if (convertToTimestamp(recent_tracks[i].date) > latestTimestamp) {
            // console.log(recent_tracks[i]);
            updateArray.push(recent_tracks[i]);
          }
        }
      }
    }

    addToUpdateArray(query, getCurrentDate(), todayUpdate);
    // query2 won't send if there is listening history so need to add this check to avoid getting undefined
    if (listeningHistoryQuery.rows.length == 0) {
      addToUpdateArray(query2, getYesterdayDate(), yesterdayUpdate);
    }
  } catch (err) {
    console.log(err.message);
  } finally {
    // console.log("todayUpdate " + todayUpdate.length);
    // console.log("yesterdayUpdate " + yesterdayUpdate.length);
    // create a new entry anytime there's an update

    async function updateDatabase(updateArray, date) {
      if (updateArray.length > 0) {
        const query = await pool.query(
          "INSERT INTO recent_tracks(tracks,user_id, calendar_date) VALUES ($1, $2, $3) RETURNING *",
          [updateArray, userId, date]
        );
      }
    }
    updateDatabase(todayUpdate, getCurrentDate());
    updateDatabase(yesterdayUpdate, getYesterdayDate());

    res.sendStatus(200);
  }
}

async function createTracks(req, res) {
  const { tracks, artists, uris, albums, duration, userId } = req.body.params;

  // check if the entry already exists for the specific duration
  try {
    const query = await pool.query(
      "SELECT * FROM tracks WHERE user_id = $1 AND duration = $2 AND created_at = $3",
      [userId, duration, getCurrentDate()]
    );
    // console.log(query.rows);
    if (query.rows.length > 0) {
      res.sendStatus(200);
      return;
    }
  } catch (err) {
    console.log(err.message);
  }

  try {
    // console.log("adding to tracks table");
    const query = await pool.query(
      "INSERT INTO tracks(tracks, artists, uris, albums, user_id, duration,created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [tracks, artists, uris, albums, userId, duration, getCurrentDate()]
    );
    res.sendStatus(200);
  } catch (err) {
    console.log(err.message);
  }
}

function sortTopGenres(genres_array) {
  // count occurrences of each genres using a map
  let counts = {};

  for (const entry of genres_array) {
    let new_entry = entry.split(", ");
    new_entry.forEach((entry) => {
      if (entry == "") {
        return;
      }
      counts[entry] = counts[entry] ? counts[entry] + 1 : 1;
    });
  }

  // console.log(counts);
  // sort the object into an array from smallest to largest
  const genresSorted = Object.keys(counts)
    .sort((a, b) => counts[a] - counts[b])
    .map((key) => ({ genre: key, occurrence: counts[key] }));
  // console.log(genresSorted);

  // get the top 10 and reverse the order

  let minLength = 0;
  if (genresSorted.length > 10) {
    minLength = genresSorted.length - 10;
  }

  const topTen = genresSorted.slice(minLength, genresSorted.length).reverse();

  return topTen;
}

function convertToTimestamp(str) {
  const timestamp = new Date(str).getTime();
  return Math.floor(timestamp / 1000);
}

function getCurrentTimestamp() {
  const timestamp = new Date().getTime();
  return Math.floor(timestamp / 1000);
}

function getCurrentDate() {
  const currentDate = DateTime.local().setZone("America/Los_Angeles");

  // Extract year, month, and day
  const year = currentDate.year;
  const month = String(currentDate.month).padStart(2, "0");
  const day = String(currentDate.day).padStart(2, "0");

  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

function getYesterdayDate() {
  const currentDate = DateTime.local().setZone("America/Los_Angeles");

  // Subtract one day to get yesterday's date
  const yesterdayDate = currentDate.minus({ days: 1 });

  const year = yesterdayDate.year;
  const month = String(yesterdayDate.month).padStart(2, "0");
  const day = String(yesterdayDate.day).padStart(2, "0");

  const formattedDate = `${year}-${month}-${day}`;

  // console.log(formattedDate);
  return formattedDate;
}

exports.getSpotifyInfo = getSpotifyInfo;
exports.refreshAccess = refreshAccess;
exports.loginSpotify = loginSpotify;
exports.getLyrics = getLyrics;
exports.getArtists = getArtists;
exports.getArtistsRankChange = getArtistsRankChange;

exports.getTracks = getTracks;
exports.getTracksRankChange = getTracksRankChange;

exports.getGenres = getGenres;
exports.getListeningHistory = getListeningHistory;

exports.updateListeningHistory = updateListeningHistory;

exports.addArtists = createArtists;
exports.addRecentTracks = addRecentTracks;
exports.createTracks = createTracks;

exports.test2 = test2;
