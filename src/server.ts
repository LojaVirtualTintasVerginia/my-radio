import express from 'express';
import fs from 'fs';
import path from 'path';
import { PassThrough, Readable } from 'stream';

import CircularBuffer from './CircularBuffer';

const app = express();
const port = process.env.PORT || 8000;
const musicDir = path.join(__dirname, 'music');
const clients = new Set<PassThrough>();

let isMasterPlaying = false;
const playSpecialTrackAfter = 15;
const specialTrack = 'verginia.mp3';


const bufferStream = new CircularBuffer(30 * 1024 * 1024); // Por exemplo, buffer para 30 MB
let musicStream = new PassThrough();

// Remove uma das definições duplicadas do endpoint '/master'

function shuffleArray(array: any[]): any[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
async function* streamFile(filePath: string) {
  const fileStream = fs.createReadStream(filePath);
  for await (const chunk of fileStream) {
    yield chunk;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Intervalo entre músicas
}

async function* generateMusicStream() {
  let playCount = 0;

  while (true) {
    let files = fs
      .readdirSync(musicDir)
      .filter((file) => path.extname(file) === ".mp3");
    shuffleArray(files);

    for (const file of files) {
      if (playCount === playSpecialTrackAfter) {
        yield* streamFile(path.join(musicDir, specialTrack));
        playCount = 0; // Resetar o contador após a música especial
      } else {
        yield* streamFile(path.join(musicDir, file));
        playCount++;
      }
    }
  }
}


async function setupMusicStream(stream: PassThrough) {
  for await (const chunk of generateMusicStream()) {
    stream.write(chunk);
  }
}

function broadcastToClients(chunk: Buffer) {
  bufferStream.write(chunk); // Escreve no buffer circular
  for (const client of clients) {
    if (!client.writableEnded) {
      client.write(chunk);
    }
  }
}

app.get('/master', async (req, res) => {
  if (!musicStream) {
    // Iniciar o stream mestre se ele ainda não foi iniciado
    musicStream = new PassThrough();
    
    // Iniciar a transmissão de música
    setupMusicStream(musicStream);

    res.send('Master stream started.');
  } else {
    res.send('Master stream is already playing.');
  }
});

app.get('/radio', (req, res) => {
  if (!musicStream) {
    return res.status(503).send('The master stream has not been started yet.');
  }

  // Define cabeçalhos para prevenir caching
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'audio/mpeg');

  // Enviar o conteúdo atual do buffer para sincronizar com a transmissão ao vivo
  const currentBufferContent = bufferStream.readCurrentContent();
  res.write(currentBufferContent);

  // Criar um novo PassThrough stream para este cliente
  const clientStream = new PassThrough();
  clients.add(clientStream);

  // Conectar o cliente ao fluxo de música existente
  musicStream.pipe(clientStream);
  clientStream.pipe(res);

  // Tratar o fechamento da conexão
  req.on('close', () => {
    if (musicStream && clientStream.writable) {
      musicStream.unpipe(clientStream);
    }
    clientStream.end();
    clients.delete(clientStream);
    console.log(`Client disconnected. Total listeners: ${clients.size}`);
  });
});
setupMusicStream(musicStream);

// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor de rádio online ouvindo na porta ${port}`);
});