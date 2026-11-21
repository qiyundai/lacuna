import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { extname } from 'node:path';

export const mediaTypes = new Map([
  ['.mp4', 'video/mp4'], ['.m4a', 'audio/mp4'], ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'], ['.wav', 'audio/wav'], ['.flac', 'audio/flac']
]);

export async function serveMedia(req, res, file, size) {
  res.setHeader('Content-Type', mediaTypes.get(extname(file)));
  res.setHeader('Accept-Ranges', 'bytes');
  let start = 0, end = size - 1;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    } else {
      start = Math.max(0, size - Number(range[2]));
    }
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') res.end();
  else await pipeline(createReadStream(file, { start, end }), res).catch(error => {
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE' && error.code !== 'ECONNRESET') throw error;
  });
}
