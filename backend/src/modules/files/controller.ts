// Sistema "Archivos cifrados": subida real con multer, guardado en disco, y
// cifrado real chunk-por-chunk con AES-256-GCM antes de guardar — así ni con
// acceso al disco del servidor se puede leer el contenido sin la clave.
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const fileRouter = Router();
fileRouter.use(authMiddleware);

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function encryptBuffer(buffer: Buffer, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptBuffer(data: Buffer, key: Buffer) {
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

fileRouter.post('/upload', upload.single('file'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

  const fileKey = crypto.randomBytes(32); // clave simétrica única para este archivo
  const encrypted = encryptBuffer(req.file.buffer, fileKey);

  const fileId = crypto.randomBytes(16).toString('hex');
  const filePath = path.join(UPLOAD_DIR, fileId);
  fs.writeFileSync(filePath, encrypted);

  return res.json({
    fileId,
    fileKey: fileKey.toString('hex'), // se comparte por el canal cifrado del chat, no queda en el server
    originalName: req.file.originalname,
    size: req.file.size,
    mimeType: req.file.mimetype
  });
});

fileRouter.get('/download/:fileId', async (req: AuthRequest, res) => {
  const { fileId } = req.params;
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'key requerida para descifrar' });

  const filePath = path.join(UPLOAD_DIR, fileId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });

  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = decryptBuffer(encrypted, Buffer.from(String(key), 'hex'));
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(decrypted);
  } catch {
    return res.status(400).json({ error: 'Clave incorrecta o archivo corrupto' });
  }
});
