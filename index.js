import fs from 'fs';
import parseArgs from 'minimist';
import path from 'path';
import { addHours, isBefore } from 'date-fns';

import Telegram from './telegram.js';
import getConfig from './config.js';
import Klassly from './klassly.js';

const argv = parseArgs(process.argv.slice(2));
const home = argv.home || '.';
const historyFile = path.join(home, 'history.json');
const lockFile = path.join(home, '.lock');

console.log('Load config & history...');
const config = getConfig(home);

try {
  const old = addHours(new Date(), -3);
  const stats = fs.statSync(lockFile);
  if (isBefore(stats.birthtime, old)) {
    fs.rmSync(lockFile);
  } else {
    console.error('Lock file there, aborting!');
    process.exit(404);
  }
} catch {}
fs.writeFileSync(lockFile, 'lock', 'utf-8');

try {
  const history = [];
  if (fs.existsSync(historyFile)) {
    history.push(
      ...JSON.parse(fs.readFileSync(historyFile, 'utf8')).map((h) => ({
        ...h,
        date: new Date(h.date),
      }))
    );
  }

  const telegram = Telegram(config);
  const klassly = Klassly(config);

  // let's go

  console.log('Login...');
  const info = await klassly.login();

  const allposts = [];
  for (const klass of info.klasses) {
    console.log(`Get posts from '${klass.name}'...`);
    let posts = await klassly.getPost(klass);
    console.log(`  --> ${posts.length} posts`);

    posts = posts.filter((p) => !history.find((h) => h.id === p.id));
    console.log(`  --> ${posts.length} new`);

    allposts.push(...posts.map((p) => ({ klass, ...p })));
  }

  console.log('Download attachments...');
  await klassly.downloadAttachments(allposts);

  console.log('Send to telegram...');
  for (const post of allposts) {
    try {
      await telegram.sendMessage(post);
      history.push({ id: post.id, date: post.date });
    } catch (e) {
      console.log('Error');
      console.log(e.response?.body?.description || e.message);
      console.log(e);
    }
  }

  console.log('Save history...');
  let synchistory = history;
  if (synchistory.length > 200) {
    synchistory = synchistory.slice(synchistory.length - 200);
  }
  fs.writeFileSync(historyFile, JSON.stringify(synchistory, null, 2), 'utf8');

  console.log('Done.');
} finally {
  try {
    fs.rmSync(lockFile);
  } catch {}
}
