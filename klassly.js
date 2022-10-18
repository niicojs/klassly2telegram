import got from 'got';
import { CookieJar } from 'tough-cookie';
import { FormData } from 'formdata-node';

export default function Klassly(config) {
  const cookieJar = new CookieJar();
  const client = got.extend({
    headers: {
      'User-Agent': config.http.agent,
    },
    cookieJar,
  });

  let token = null;
  let device = 'web-134e32e568cb0';
  let imgtoken = null;

  const setCommon = (form) => {
    form.set('auth_token', token);
    form.set('device', device);
    form.set('app_id', '553e7f3c01ae1');
    form.set('version', '6.6');
    form.set('culture', 'en');
    form.set('apptype', 'klassroom');
    form.set('gmtoffset', '-120');
    form.set('tz', 'Europe/Paris');
    form.set('dst', 'true');
  };

  const login = async () => {
    console.log('Login...');
    await client.get('https://fr.klass.ly/').text();

    device = cookieJar
      .getCookiesSync('https://fr.klass.ly/')
      .find((c) => c.key === 'klassroom_device').value;

    const logindata = new FormData();
    logindata.set('phone', config.login.user);
    logindata.set('password', config.login.password);
    setCommon(logindata);
    const loginresponse = await client
      .post('https://api2.klassroom.co/auth.basic', { body: logindata })
      .json();
    if (!loginresponse.ok) throw new Error('Error during login.');
    token = loginresponse.auth_token;

    const connectdata = new FormData();
    setCommon(connectdata);
    const data = await client
      .post('https://api2.klassroom.co/app.connect', { body: connectdata })
      .json();

    cookieJar.setCookieSync(`klassroom_device=${device}`, 'https://klass.ly/');
    cookieJar.setCookieSync(`klassroom_token=${token}`, 'https://klass.ly/');
    const html = await client.get('https://klass.ly/').text();
    const m = html.match(
      /<img src="https:\/\/www.klass.ly\/_data\/klassroomauth\?klassroomauth=(\d|\w+)"/m
    );
    imgtoken = m[1];

    cookieJar.setCookieSync(`klassroomauth=${imgtoken}`, 'https://www.klass.ly/');
    cookieJar.setCookieSync(`klassroomauth=${imgtoken}`, 'https://fr.klass.ly/');
    cookieJar.setCookieSync(`klassroomauth=${imgtoken}`, 'https://data.klassroom.co');

    console.log(` --> logged in as ${data.self.name}`);

    return {
      token,
      user: {
        id: data.self.id,
        name: data.self.name,
      },
      klasses: Object.keys(data.klasses)
        .map((id) => ({
          id,
          key: data.klasses[id].key,
          name: data.klasses[id].natural_name,
          closed: data.klasses[id].is_closed,
        }))
        .filter((k) => !k.closed),
    };
  };

  const getPost = async (klass) => {
    console.log(`Get posts from '${klass.name}'...`);

    const body = new FormData();
    body.set('id', klass.id);
    body.set('filter', 'all');
    body.set('type', 'post');
    body.set('from', new Date().getTime());
    setCommon(body);
    const data = await client.post('https://api2.klassroom.co/klass.history', { body }).json();

    if (!data.ok) throw new Error('Unable to get posts');

    return Object.keys(data.posts)
      .map((id) => ({
        id,
        datems: data.posts[id].date,
        date: new Date(data.posts[id].date),
        from: data.posts[id].user.name,
        text: data.posts[id].text,
        type: data.posts[id].type,
        attachments: Object.keys(data.posts[id].attachments).map((a) => ({
          id: data.posts[id].attachments[a].id,
          type: data.posts[id].attachments[a].type,
          url: data.posts[id].attachments[a].url,
          name: data.posts[id].attachments[a].name,
        })),
      }))
      .sort((a, b) => b.datems - a.datems);
  };

  const downloadAttachments = async (posts) => {
    console.log('Download attachments...');
    for (const post of posts) {
      for (const attach of post.attachments) {
        let url = attach.url;
        if (url.startsWith('https://data.klassroom.co')) {
          url = 'https://www.klass.ly/_data' + url.substring('https://data.klassroom.co'.length);
        }
        attach.data = await client.get(url).buffer();
      }
    }

    return posts;
  };

  return {
    login,
    getPost,
    downloadAttachments,
  };
}
