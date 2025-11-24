import { Blob } from 'buffer';
import { ofetch } from 'ofetch';
import { format } from 'date-fns';

function chunk(items, size) {
  const chunks = [];
  items = [].concat(...items);

  while (items.length) {
    chunks.push(items.splice(0, size));
  }

  return chunks;
}

export default function Telegram(config) {
  const token = config.telegram.token;
  const chatId = config.telegram.chatId;
  const throttling = config.telegram?.throttling || 0;

  let last = new Date().getTime() - throttling;
  const throttle = async () => {
    if (throttling > 0 && new Date().getTime() < last + throttling) {
      await new Promise((resolve) => setTimeout(resolve, throttling));
    }
    last = new Date().getTime();
  };
  const wait = async (time) => {
    return new Promise((resolve) => setTimeout(resolve, time));
  };

  const client = ofetch.create({
    method: 'POST',
    baseURL: `https://api.telegram.org/bot${token}`,
    retry: 5,
    retryDelay: (ctx) => {
      const opt = ctx.options;
      const attempt = (opt.retryAttempt = (opt.retryAttempt || 0) + 1);
      if (attempt < 2) {
        return 2 ** (attempt - 1) * 1_000;
      } else {
        return 61_000;
      }
    },
    retryStatusCodes: [408, 429, 503, 504],
  });

  const escape = (text) => {
    if (!text) return '\\.';
    return text.replace(/(_|\*|\[|\]|\(|\)|~|`|>|#|\+|-|=|\||\{|\}|\.|!)/g, '\\$1');
  };

  const sendAttachments = async (files, type) => {
    console.log(`Send ${files.length} ${type} attachments...`);
    if (files.length === 1) {
      await throttle();
      const api = {
        photo: 'sendPhoto',
        document: 'sendDocument',
        video: 'sendVideo',
        audio: 'sendAudio',
      };
      const file = files[0];
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('disable_notification', true);
      form.append(type, new Blob([file.data.buffer]), file.name);
      await client(api[type], { body: form });
    } else {
      let idx = 1;
      for (const elts of chunk(files, 10)) {
        await throttle();
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('disable_notification', true);
        const media = [];
        for (const file of elts) {
          const name = (idx++).toString().padStart(2, '0');
          media.push({
            type: type,
            media: `attach://${name}`,
          });
          form.append(name, new Blob([file.data.buffer]), file.name);
        }
        form.append('media', JSON.stringify(media));
        await client('sendMediaGroup', { body: form });
        if (elts.length >= 10) {
          await wait(1 * 60 * 1_000 + 100); // wait a minute to avoid throttling
        }
      }
    }
  };

  const sendMessage = async (post) => {
    if (!['message', 'poll'].includes(post.type)) {
      post.text = `Nouveau message de type '${post.type}`;
    }

    await throttle();

    await client('sendMessage', {
      body: {
        chat_id: chatId,
        parse_mode: 'MarkdownV2',
        text: `
*__${escape(post.klass.name)}__*
De ${escape(post.from)}
${format(post.date, `'Le' dd/MM/yy 'à' hh:mm:ss`)}
  
_${escape(post.text)}_`,
      },
    });

    if (post.type === 'poll') {
      await client('sendMessage', {
        body: {
          chat_id: chatId,
          parse_mode: 'MarkdownV2',
          text: `
*__\\(sondage disponible sur l'appli\\)__*
    
_${escape(post.poll.question)}_`,
        },
      });
    }

    // send photos
    const images = post.attachments.filter((a) => a.type === 'image');
    if (images.length > 0) await sendAttachments(images, 'photo');

    // document (pdf par exemple)
    const docs = post.attachments.filter((a) => a.type === 'document');
    if (docs.length > 0) await sendAttachments(docs, 'document');

    // send videos
    const videos = post.attachments.filter((a) => a.type === 'video');
    if (videos.length > 0) await sendAttachments(videos, 'video');

    // notif pour les autres objets (audio ?)
    const others = post.attachments.filter((a) => !['image', 'document', 'video'].includes(a.type));
    if (others.length > 0) {
      await throttle();
      await client('sendMessage', {
        body: {
          chat_id: config.telegram.chatId,
          parse_mode: 'MarkdownV2',
          text: `${others.length} objet${others.length > 1 ? 's' : ''} de type ${others
            .map((o) => o.type)
            .join(',')}`,
        },
      });
    }
  };

  return { client, sendMessage };
}
