import 'global-agent/bootstrap.js';
import fs from 'fs';
import toml from 'toml';
import { chromium } from 'playwright-chromium';
import Telegram from './telegram.js';
import parseArgs from 'minimist';
import path from 'path';

const argv = parseArgs(process.argv.slice(2));
const home = argv.home || '.';
const configFile = path.join(home, 'config.toml');
const historyFile = path.join(home, 'history.json');

console.log('Load config & history...');
if (!fs.existsSync(configFile)) {
  console.error('No config file!');
  process.exit(404);
}

const config = toml.parse(fs.readFileSync(configFile, 'utf-8'));
if (config.proxy?.url) {
  global.GLOBAL_AGENT.HTTP_PROXY = config.proxy.url;
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
}

const history = [];
if (fs.existsSync(historyFile)) {
  history.push(
    ...JSON.parse(fs.readFileSync(historyFile, 'utf8')).map((h) => ({
      ...h,
      date: new Date(h.date),
    }))
  );
}

const browser = await chromium.launch({
  proxy: config.proxy?.url ? { server: config.proxy.url } : undefined,
  // headless: false,
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
});
await context.route('**/*.{png,jpg,jpeg}', (route) => route.abort());

const page = await context.newPage();

// login
const login = async () => {
  console.log('Login...');
  try {
    await page.goto('https://fr.klass.ly/');
    await page.locator('.phone-input').fill(config.login.user);
    await page.locator('.form-input-text2__input').fill(config.login.password);
    await page.locator('.kr-login-form__btn').waitFor('visible');
    await page.locator('.kr-login-form__btn').click();
    await page.waitForURL('https://fr.klass.ly/#class');
    console.log('  Ok');
  } catch (e) {
    console.error(e);
  }
};

// get posts from class
const getInfoFromClass = async (title) => {
  console.log(`Get info from '${title}'...`);
  await page.goto('https://fr.klass.ly/#class');

  await page.locator('.class-list-items').waitFor();
  await page.locator(`[title="${title}"]`).click();

  await page.waitForURL('**/#class/inside/*');

  await page.locator('.timeline_posts-react').waitFor('visible');

  const data = await page
    .locator('_react=TimelinePostWrapperComponent')
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        console.log(node);
        try {
          const keys = Object.keys(node);
          const instanceKey = keys.filter((prop) =>
            /__reactInternalInstance/.test(prop)
          )[0];
          const post = node[instanceKey].return.stateNode.props.post;
          return post;
        } catch (e) {
          return { error: e };
        }
      })
    );

  console.log(`  ${data.length} posts`);

  const posts = await Promise.all(
    data.reverse().map(async (post) => ({
      id: post.id,
      date: post.date,
      from: post.user.name,
      text: post.text,
      attachments: await Promise.all(
        Object.values(post.attachments).map(async (v) => ({
          type: v.type,
          url: v.url,
          name: v.name,
          cookies: await context.cookies(v.url),
        }))
      ),
      type: post.type,
    }))
  );

  return posts;
};

await login();
const telegram = new Telegram(config);

const allposts = [];
for (const name of config.classes.names) {
  let posts = await getInfoFromClass(name);
  posts = posts.filter((p) => !history.find((h) => h.id === p.id));
  console.log(`  ${posts.length} new`);
  allposts.push(...posts.map((p) => ({ klass: name, ...p })));
}

fs.writeFileSync(
  path.join(home, 'posts.json'),
  JSON.stringify(allposts, null, 2),
  'utf8'
);

for (const post of allposts) {
  try {
    await telegram.sendMessage(post);
    history.push({ id: post.id, date: post.date });
  } catch (e) {
    console.error(e.response?.body?.description || e.message);
    console.error(e);
  }
}

await context.close();
await browser.close();

console.log('Save history...');
fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');

console.log('Done.');
