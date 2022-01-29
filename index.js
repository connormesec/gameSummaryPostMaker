const puppeteer = require('puppeteer');
const WPAPI = require('wpapi');
const axios = require('axios');

const teamId = 51;

async function main() {
  let newGameIds = await getNewCompletedGameIds(teamId);
  let oldGameIds = await getOldCompletedGameIds(teamId);
  let difference = newGameIds.filter(x => !oldGameIds.includes(x));
  //use gameids to generate images and create a new wp post
  difference.forEach(async gameId => {
    let gameData = await getGameInfo(gameId);
    let titles = createTitlesFromGameData(gameData);
    let imageData = await getImageDataURLFromGraphicBuilder(gameId)
    createWordPressPost(imageData, titles.postTitle, titles.featuredImageTitle, titles.imageName)
  });
  //TODO: update S3 with new game Ids

}

main()

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
  let defeatLanguage = []
  let victoryLanguage = []
  let postTitle = '';
  if (focusTeam.stats.goals > opponentTeam.stats.goals) {
    postTitle = `${focusTeam.info.nickname} defeat ${opponentTeam.info.nickname} (${focusTeam.stats.goals}-${opponentTeam.stats.goals})`;
  } else if (focusTeam.stats.goals < opponentTeam.stats.goals) {
    postTitle = `${focusTeam.info.nickname} defeated by ${opponentTeam.info.nickname} (${focusTeam.stats.goals}-${opponentTeam.stats.goals})`;
  } else {
    postTitle = 'It was a tie!'
  };
  let featuredImageTitle = `${focusTeam.info.abbreviation} vs ${opponentTeam.info.abbreviation} ${gameData.details.date}`;
  let imageName = featuredImageTitle.replace(/\s/g, '') + '.jpeg';

  return {
    postTitle: postTitle,
    featuredImageTitle: featuredImageTitle,
    imageName: imageName
  }
}

function createWordPressPost(b64url, postTitle, featuredImageTitle, imageName) {

  let wp = new WPAPI({
    endpoint: 'https://www.msuhockey.com/wp-json/',
    username: 'api_user',
    password: 'fuck_c@r0n@_2020'
  });

  wp.posts().create({
    // "title" and "content" are the only required properties
    title: postTitle,
    content: '',
    // Post will be created as a draft by default if a specific "status"
    // is not specified
    status: 'publish'
  }).then(function (post) {
    // Create the media record & upload your image file
    return wp.media().file(bufToFile(b64url), imageName).create({
      title: featuredImageTitle,
      post: post.id
    }).then(function (media) {
      // Set the new media record as the post's featured media
      return wp.posts().id(post.id).update({
        featured_media: media.id
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
  var buffer = Buffer.from(data, 'base64');
  return buffer
  //fs.writeFileSync('data.' + ext, buffer);
}


async function getImageDataURLFromGraphicBuilder(gameID) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://infographic-774cc.firebaseapp.com/');

  const newInputValue = gameID;
  await page.evaluate(val => document.querySelector('.field').value = val, newInputValue);
  await page.$eval('.button', form => form.click());

  await page.waitForSelector('#screenshot', { visible: true });

  await delay(3000);
  let image = await page.evaluate(() => {
    return document.querySelector('canvas').toDataURL('image/jpeg', 0.5);
  });

  await browser.close();

  return image;
}
//getImageDataURLFromGraphicBuilder(3839).then(dat => createWordPressPost(dat))

function delay(time) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time)
  });
}

async function getGameInfo(gameId) {
  let url = `https://lscluster.hockeytech.com/feed/index.php?feed=statviewfeed&view=gameSummary&game_id=${gameId}&key=e6867b36742a0c9d&site_id=2&client_code=acha&lang=en`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  let response = await axios.get(url, { headers }).catch((error) => {
    console.error(error);
  });
  let jsonp = response.data;
  let validJson = JSON.parse(jsonp.substring(jsonp.indexOf("(") + 1, jsonp.lastIndexOf(")")));

  return validJson;
}

async function getNewCompletedGameIds(teamId) {
  let url = `https://lscluster.hockeytech.com/feed/index.php?feed=statviewfeed&view=schedule&team=${teamId}&season=10&month=-1&location=homeaway&key=e6867b36742a0c9d&client_code=acha&site_id=2&league_id=1&division_id=2&lang=en`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  let response = await axios.get(url, { headers }).catch((error) => {
    console.error(error);
  });
  let jsonp = response.data;
  let validJson = JSON.parse(jsonp.substring(jsonp.indexOf("(") + 1, jsonp.lastIndexOf(")")));
  let resultArr = [];
  validJson[0].sections[0].data.forEach((data) => { 
    if (/Final/.test(data.row.game_status) === true) {
      resultArr.push(data.row.game_id) 
    }
  });
  return resultArr;
}

async function getOldCompletedGameIds() {
  let url = `https://msuhockey-roster-google-sheets.s3.us-east-2.amazonaws.com/d2_2021-22_game_schedule.json`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  let response = await axios.get(url, { headers }).catch((error) => {
    console.error(error);
  });

  //return response.data;
  return [
    '3839', '3840', '5601',
    '2605', '4082', '4500',
    '4581', '4582', '4583',
    '4584', '4585', '5157',
    '4586', '4587', '4588',
    '5708', '5621', '5709',
    '5149', '4589', '4590',
    '4591', '5152'
  ];
}
