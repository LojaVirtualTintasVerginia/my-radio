import express from 'express';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';

const app = express();
const port = process.env.PORT || 8000;
const musicDir = path.join(__dirname, 'music');
const clients = new Set<PassThrough>();

let isMasterPlaying = false;
let musicStream: PassThrough | null = null;
const playSpecialTrackAfter = 15;
const specialTrack = 'verginia.mp3';

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
app.get('/radio', (req, res) => {
  // Define cabeçalhos para prevenir caching
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  if (!musicStream) {
    return res.status(503).send('The master stream has not been started yet.');
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  const clientStream = new PassThrough();

  clients.add(clientStream);
  musicStream.pipe(clientStream); // Pipe musicStream para o novo clientStream
  clientStream.pipe(res); // Envie os dados do clientStream para a resposta HTTP

  req.on('close', () => {
    // Verifica se musicStream e clientStream são válidos antes de chamar unpipe
    if (musicStream && clientStream.writable) {
      musicStream.unpipe(clientStream);
    }
    clientStream.end(); // Fechar o clientStream para liberar recursos
    clients.delete(clientStream);
    console.log(`Client disconnected. Total listeners: ${clients.size}`);
  });
});


async function setupMusicStream(stream: PassThrough) {
  for await (const chunk of generateMusicStream()) {
    stream.write(chunk);
  }
}

function broadcastToClients(chunk: Buffer) {
  for (const client of clients) {
    if (!client.writableEnded) {
      client.write(chunk);
    }
  }
}

// ... (mantenha o restante das funções como estão)

// Inicialização do servidor
app.listen(port, () => {
  console.log(`Servidor de rádio online ouvindo na porta ${port}`);
});