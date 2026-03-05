import * as net from 'net';

export type ClamResult = { clean: true } | { clean: false; virus: string };

export async function scanWithClamAV(host: string, port: number, reader: NodeJS.ReadableStream): Promise<ClamResult> {
  return new Promise<ClamResult>((resolve, reject) => {
    const socket = new net.Socket();
    let resolved = false;
    socket.setTimeout(60_000);

    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error('ClamAV timeout'));
      }
    });
    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    socket.connect(port, host, () => {
      // INSTREAM protocol
      socket.write('zINSTREAM\0');

      reader.on('data', (chunk: Buffer) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(buf.length, 0);
        socket.write(len);
        socket.write(buf);
      });
      reader.on('end', () => {
        const zero = Buffer.alloc(4);
        zero.writeUInt32BE(0, 0);
        socket.write(zero);
      });
      reader.on('error', (e) => {
        socket.destroy(e as any);
      });

      let response = '';
      socket.on('data', (d) => {
        response += d.toString('utf8');
      });
      socket.on('close', () => {
        if (resolved) return;
        resolved = true;
        // Expected formats: 'stream: OK\n' or 'stream: Eicar-Test-Signature FOUND\n'
        const line = response.trim();
        if (/\bOK\b/i.test(line)) {
          resolve({ clean: true });
        } else {
          const m = line.match(/stream:\s*(.+)\s*FOUND/i);
          const virus = m?.[1] || 'UNKNOWN';
          resolve({ clean: false, virus });
        }
      });
    });
  });
}

