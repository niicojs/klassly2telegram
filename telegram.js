import got from 'got';
import { CookieJar } from 'tough-cookie';
import { setDefaultOptions, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale/index.js';

setDefaultOptions({ locale: fr });

export default function Telegram(config) {
  const token = config.telegram.token;
  const chatId = config.telegram.chatId;
  const throttling = config.telegram?.throttling || 0;

  let last = new Date().getTime() - throttling;
  const throttle = async () => {
    if (throttling > 0 && new Date().getTime() - throttling < last) {
      await new Promise((resolve) => setTimeout(resolve, throttling));
    }
    last = new Date().getTime();
  };

  const client = got.extend({
    prefixUrl: `https://api.telegram.org/bot${token}`,
    resolveBodyOnly: true,
    responseType: 'json',
  });

  const escape = (text) =>
    text.replace(
      /(\_|\*|\[|\]|\(|\)|\~|\`|\>|\#|\+|\-|\=|\||\{|\}|\.|\!)/g,
      '\\$1'
    );

  const downloadFile = async (file) => {
    const cookieJar = new CookieJar();
    for (const c of file.cookies) {
      await cookieJar.setCookie(`${c.name}=${c.value}`, file.url);
    }
    return got.get(file.url, { cookieJar }).buffer();
  };

  const sendAttachments = async (files, type) => {
    if (files.length === 1) {
      const api = {
        photo: 'sendPhoto',
        document: 'sendDocument',
        video: 'sendVideo',
        audio: 'sendAudio',
      };
      const file = files[0];
      const raw = await downloadFile(file);
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('disable_notification', true);
      form.append(type, new Blob([raw]), file.name);
      await client.post(api[type], { body: form });
    } else {
      const form = new FormData();
      form.append('chat_id', chatId);
      const media = [];
      for (const file of files) {
        const raw = await downloadFile(file);
        media.push({
          type: type,
          media: `attach://${file.name}`,
        });
        form.append(file.name, new Blob([raw]), file.name);
      }
      form.append('media', JSON.stringify(media));
      await client.post('sendMediaGroup', { body: form });
    }
  };

  const sendMessage = async (post) => {
    if (post.type !== 'message') {
      post.text = `Nouveau message de type '${post.type}`;
    }

    await throttle();

    await client.post('sendMessage', {
      json: {
        chat_id: chatId,
        parse_mode: 'MarkdownV2',
        text: `
*__${escape(post.klass)}__*
De ${escape(post.from)} ${formatDistanceToNow(post.date, { addSuffix: true })}
  
_${escape(post.text)}_`,
      },
    });

    // send photos
    const images = post.attachments.filter((a) => a.type === 'image');
    if (images.length > 0) {
      await throttle();
      await sendAttachments(images, 'photo');
    }

    // document (pdf par exemple)
    const docs = post.attachments.filter((a) => a.type === 'document');
    if (docs.length > 0) {
      await throttle();
      await sendAttachments(docs, 'document');
    }

    // notif pour les autres objets (video ? audio ?)
    const others = post.attachments.filter(
      (a) => !['image', 'document'].includes(a.type)
    );
    if (others.length > 0) {
      await throttle();
      await client.post('sendMessage', {
        json: {
          chat_id: config.telegram.chatId,
          parse_mode: 'MarkdownV2',
          text: `${others.length} objet${
            others.length > 1 ? 's' : ''
          } de type ${others.map((o) => o.type).join(',')}`,
        },
      });
    }
  };

  return { client, sendMessage };
}
