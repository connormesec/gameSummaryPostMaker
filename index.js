const puppeteer = require("puppeteer");
const WPAPI = require("wpapi");
const axios = require("axios");
const wpCreds = require("./wpCreds.json");

const seasonId = 10;
const teamId = 51;
const teamWordpressURL = "https://msuhockey.com/";

main();

async function main() {
  let newGameIds = await getNewCompletedGameIds(teamId);
  let oldGameIds = await getPostSlugs(teamWordpressURL);
  let difference = newGameIds.filter((x) => !oldGameIds.includes(x));

  //use gameids to generate images and create a new wp post
  for (let i = 0; i < difference.length; i++) {
    let gameId = difference[i];
    let gameData = await getGameInfo(gameId);
    let titles = createTitlesFromGameData(gameData);
    let imageData = await getImageDataURLFromGraphicBuilder(gameId);
    createWordPressPost(
      imageData,
      titles.postTitle,
      titles.featuredImageTitle,
      titles.imageName,
      titles.date_gmt,
      titles.gameID
    );
  }
}

function createTitlesFromGameData(gameData) {
  let focusTeam;
  let opponentTeam;
  if (gameData.visitingTeam.info.id === teamId) {
    focusTeam = gameData.visitingTeam;
    opponentTeam = gameData.homeTeam;
  } else {
    focusTeam = gameData.homeTeam;
    opponentTeam = gameData.visitingTeam;
  }

  let verb = "";
  if (focusTeam.stats.goals > opponentTeam.stats.goals) {
    if (opponentTeam.stats.goals == 0) {
      verb = "shutout";
    } else if (focusTeam.stats.goals - opponentTeam.stats.goals == 1) {
      //close game
      let language = [
        "top",
        "rally past",
        "slip past",
        "sneak by",
        "squeak past",
        "rout",
        "eke out win over",
      ];
      verb = randomElement(language);
    } else if (focusTeam.stats.goals - opponentTeam.stats.goals <= 3) {
      //2-3 goal diff
      let language = ["defeat", "top", "beat", "trounce", "best", "overcome"];
      verb = randomElement(language);
    } else {
      //blowout
      let language = [
        "overpower",
        "vanquish",
        "cruise past",
        "trounce",
        "blow out",
        "blast",
        "smash",
      ];
      verb = randomElement(language);
    }
  } else if (focusTeam.stats.goals < opponentTeam.stats.goals) {
    if (focusTeam.stats.goals == 0) {
      verb = "shutout by";
    } else if (opponentTeam.stats.goals - focusTeam.stats.goals == 1) {
      let language = [
        "fall to",
        "bested by",
        "topped by",
        "edged by",
        "defeated by",
      ];
      verb = randomElement(language);
    } else if (opponentTeam.stats.goals - focusTeam.stats.goals <= 5) {
      let language = [
        "defeated by",
        "loose to",
        "bested by",
        "downed by",
        "toppled by",
        "taken down by",
      ];
      verb = randomElement(language);
    } else {
      //blowout
      let language = [
        "overpowered by",
        "vanquished by",
        "trounced by",
        "smashed by",
        "crushed by",
      ];
      verb = randomElement(language);
    }
  } else {
    verb = "tie";
  }

  let postTitle = `${focusTeam.info.nickname} ${verb} ${opponentTeam.info.nickname}`;
  //handle shootout and OT
  if (gameData.hasShootout == true) {
    postTitle = `${postTitle} in shootout`;
  } else if (/OT/.test(gameData.details.status) == true) {
    postTitle = `${postTitle} in OT`;
  }

  postTitle = `${postTitle} (${focusTeam.stats.goals}-${opponentTeam.stats.goals})`;

  let featuredImageTitle = `${focusTeam.info.abbreviation} vs ${opponentTeam.info.abbreviation} ${gameData.details.date}`;
  let imageName = featuredImageTitle.replace(/\s/g, "") + ".jpeg";

  return {
    postTitle: postTitle,
    featuredImageTitle: featuredImageTitle,
    imageName: imageName,
    date_gmt: new Date(gameData.details.date),
    gameID: `${gameData.details.id}`,
  };

  function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

function createWordPressPost(
  b64url,
  postTitle,
  featuredImageTitle,
  imageName,
  date_gmt,
  game_id
) {
  let wp = new WPAPI(wpCreds);

  wp.posts()
    .create({
      // "title" and "content" are the only required properties
      title: postTitle,
      content: "",
      date_gmt: date_gmt,
      slug: game_id,
      // Post will be created as a draft by default if a specific "status"
      // is not specified
      status: "publish",
    })
    .then(function (post) {
      // Create the media record & upload your image file
      return wp
        .media()
        .file(bufToFile(b64url), imageName)
        .create({
          title: featuredImageTitle,
          post: post.id,
        })
        .then(function (media) {
          // Set the new media record as the post's featured media
          return wp.posts().id(post.id).update({
            featured_media: media.id,
          });
        });
    });
}

function bufToFile(uri) {
  var string = `${uri}`;
  var regex = /^data:.+\/(.+);base64,(.*)$/;

  var matches = string.match(regex);
  var ext = matches[1];
  var data = matches[2];
  var buffer = Buffer.from(data, "base64");
  return buffer;
}

async function getImageDataURLFromGraphicBuilder(gameID) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://infographic-774cc.firebaseapp.com/");

  const newInputValue = gameID;
  await page.evaluate(
    (val) => (document.querySelector(".field").value = val),
    newInputValue
  );
  await page.$eval(".button", (form) => form.click());

  await page.waitForSelector("#screenshot", { visible: true });

  await delay(3000);
  let image = await page.evaluate(() => {
    return document.querySelector("canvas").toDataURL("image/jpeg", 0.5);
  });

  await browser.close();

  return image;
}

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

async function getGameInfo(gameId) {
  let url = `https://lscluster.hockeytech.com/feed/index.php?feed=statviewfeed&view=gameSummary&game_id=${gameId}&key=e6867b36742a0c9d&site_id=2&client_code=acha&lang=en`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let response = await axios.get(url, { headers }).catch((error) => {
    console.error(error);
  });
  let jsonp = response.data;
  let validJson = JSON.parse(
    jsonp.substring(jsonp.indexOf("(") + 1, jsonp.lastIndexOf(")"))
  );

  return validJson;
}

async function getNewCompletedGameIds(teamId) {
  let url = `https://lscluster.hockeytech.com/feed/index.php?feed=statviewfeed&view=schedule&team=${teamId}&season=${seasonId}&month=-1&location=homeaway&key=e6867b36742a0c9d&client_code=acha&site_id=2&league_id=1&division_id=2&lang=en`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let response = await axios.get(url, { headers }).catch((error) => {
    console.error(error);
  });
  let jsonp = response.data;
  let validJson = JSON.parse(
    jsonp.substring(jsonp.indexOf("(") + 1, jsonp.lastIndexOf(")"))
  );
  let resultArr = [];
  validJson[0].sections[0].data.forEach((data) => {
    if (/Final/.test(data.row.game_status) === true) {
      resultArr.push(data.row.game_id);
    }
  });
  return resultArr;
}

//page slugs correspond to the gameID, we get all post slugs
//to know if we need to create a post or not
async function getPostSlugs(teamWordpressURL) {
  let url = `${teamWordpressURL}wp-json/wp/v2/posts?per_page=100`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  let response = await axios.get(url, { headers }).catch((error) => {
    console.error(error);
  });
  let gameIDs = [];
  response.data.forEach((x) => {
    //flter results to only include posts with numbers and change
    //posts to only include numbers before first '-'.
    //Ex 1234-5 becomes 1234, this way it supports duplicate slugs
    if (/\d/.test(x.slug)) {
      gameIDs.push(x.slug.split("-")[0]);
    }
  });
  return gameIDs;
}
