import express from 'express';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';

import CircularBuffer from './CircularBuffer';

const app = express();
const port = process.env.PORT || 8000;
const musicDir = path.join(__dirname, 'music');
const clients = new Set<PassThrough>();
const MUSIC_INTERVAL = 1000; 

const bufferStream = new CircularBuffer(30 * 1024 * 1024); // Por exemplo, buffer para 30 MB
let musicStream = new PassThrough();

function shuffleArray(array: any[]): any[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function* streamFile(filePath: string) {
  try {
    const fileStream = fs.createReadStream(filePath);
    for await (const chunk of fileStream) {
      yield chunk;
    }
    await new Promise((resolve) => setTimeout(resolve, MUSIC_INTERVAL));
  } catch (error) {
    console.error(`Error streaming file ${filePath}: ${error}`);
    // Handle error appropriately
  }
}

async function* generateMusicStream() {
  while (true) {
    let files = fs
      .readdirSync(musicDir)
      .filter((file) => path.extname(file) === ".mp3");
    shuffleArray(files);

    for (const file of files) {
      yield* streamFile(path.join(musicDir, file));
    }
  }
}

async function setupMusicStream(stream: PassThrough) {
  for await (const chunk of generateMusicStream()) {
    broadcastToClients(chunk); // Alteração aqui
    // Manter o loop ativo mesmo sem clientes
    if (clients.size === 0) {
      stream.write(chunk);
    }
  }
}

function broadcastToClients(chunk: Buffer) {
  bufferStream.write(chunk); // Correção aqui

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

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Add any other headers common to all routes
  next();
});

app.get('/radio', (req, res) => {
  res.setHeader('Content-Type', 'audio/mpeg');
  // Enviar o conteúdo atual do buffer para sincronizar com a transmissão ao vivo
  const currentBufferContent = bufferStream.readCurrentContent();
  res.write(currentBufferContent);

  // Criar um novo PassThrough stream para este cliente
  const clientStream = new PassThrough();
  clients.add(clientStream);

  // Correção: use clientStream.pipe(res) diretamente
  clientStream.pipe(res);
  

  // Transmite a música atual para o novo cliente
  broadcastToClients(currentBufferContent);

  // Tratar o fechamento da conexão
  req.on('close', () => {
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

// Inicie a transmissão principal imediatamente
