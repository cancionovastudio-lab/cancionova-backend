require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { SquareClient, SquareEnvironment } = require('square');
const fetch   = require('node-fetch');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

const client = new SquareClient({
  token:       process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production,
});

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','Accept'] }));
app.use(express.json());

app.get('/',       (req, res) => res.json({ status: 'CancionOva backend running', ok: true }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/payment', async (req, res) => {
  const { sourceId, amountCents, package: pkg, nombre, apellido, whatsapp, email, para, nombres, ocasion, voz, estilo1, estilo2, historia } = req.body;

  if (!sourceId || !amountCents) return res.status(400).json({ error: true, message: 'Faltan datos del pago' });

  const amount     = Number(amountCents);
  if (![3000, 5000].includes(amount)) return res.status(400).json({ error: true, message: 'Monto invalido' });

  const pkgName    = pkg === 'premium' ? 'Paquete Premium' : 'Paquete Basico';
  const pkgPrice   = '$' + amount / 100 + ' USD';
  const clientName = nombre + ' ' + apellido;
  const now        = new Date();
  const orderDate  = now.toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });
  const orderTime  = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  try {
    // 1. Cobrar tarjeta con Square
    const response = await client.payments.create({
      sourceId:          sourceId,
      idempotencyKey:    crypto.randomUUID(),
      amountMoney:       { amount: BigInt(amount), currency: 'USD' },
      note:              'CancionOva - ' + pkgName + ' - ' + clientName,
      buyerEmailAddress: email,
    });

    const payment = response.payment;
    console.log('[PAYMENT OK] ID:', payment.id, '|', pkgPrice, '|', clientName);

    // 2. Email al admin (CancionOva)
    try {
      await fetch('https://formspree.io/f/xkoljybv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject:            'Nueva orden - ' + pkgName + ' ' + pkgPrice,
          'Payment ID':        payment.id,
          'Paquete':           pkgName + ' - ' + pkgPrice,
          'Fecha':             orderDate + ' ' + orderTime,
          'Nombre':            clientName,
          'WhatsApp':          whatsapp,
          'Email':             email,
          'Para quien':        para,
          'Nombres':           nombres,
          'Ocasion':           ocasion,
          'Voz':               voz,
          'Estilo 1':          estilo1,
          'Estilo 2':          estilo2,
          'Historia':          historia,
        }),
      }).then(r => console.log(r.ok ? '[ADMIN EMAIL OK]' : '[ADMIN EMAIL WARN]'));
    } catch(e) { console.warn('[ADMIN EMAIL ERROR]', e.message); }

    // 3. Recibo al CLIENTE
    if (email) {
      try {
        const receipt = [
          'Hola ' + clientName + ',',
          '',
          'Gracias por tu pedido en CancionOva! Tu pago fue procesado exitosamente.',
          '',
          '--- DETALLES DE TU ORDEN ---',
          'Paquete: ' + pkgName,
          'Monto pagado: ' + pkgPrice,
          'Fecha: ' + orderDate + ' a las ' + orderTime,
          'ID de pago: ' + payment.id,
          '',
          '--- TU CANCION ---',
          'Para: ' + para,
          'Nombres a incluir: ' + nombres,
          'Ocasion: ' + ocasion,
          'Genero de voz: ' + voz,
          'Estilo 1: ' + estilo1,
          'Estilo 2: ' + estilo2,
          '',
          '--- ENTREGA ---',
          'Recibiras tu cancion en 24 a 48 horas por WhatsApp al numero: ' + whatsapp,
          '',
          'Si tienes preguntas escríbenos por WhatsApp al +1 786 530 9250',
          '',
          'CancionOva - Canciones Personalizadas',
          'cancionova.com',
        ].join('\n');

        await fetch('https://formspree.io/f/xkoljybv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            _subject: 'Recibo de tu pedido - CancionOva',
            _replyto: 'info@cancionova.com',
            _to:      email,
            message:  receipt,
          }),
        }).then(r => console.log(r.ok ? '[CLIENT EMAIL OK] -> ' + email : '[CLIENT EMAIL WARN]'));
      } catch(e) { console.warn('[CLIENT EMAIL ERROR]', e.message); }
    }

    return res.status(200).json({ ok: true, paymentId: payment.id, status: payment.status, message: 'Pago procesado exitosamente' });

  } catch (error) {
    console.error('[PAYMENT ERROR]', error.message || error);
    let message = 'Error procesando el pago. Verifica los datos de tu tarjeta.';
    if (error.errors) {
      const codes = error.errors.map(e => e.code);
      if (codes.includes('CARD_DECLINED'))      message = 'Tarjeta declinada. Intenta con otra tarjeta.';
      if (codes.includes('INSUFFICIENT_FUNDS')) message = 'Fondos insuficientes en la tarjeta.';
      if (codes.includes('INVALID_CARD'))       message = 'Tarjeta invalida. Verifica los datos.';
      if (codes.includes('CARD_EXPIRED'))       message = 'La tarjeta esta vencida.';
      if (codes.includes('CVV_FAILURE'))        message = 'CVV incorrecto.';
    }
    return res.status(402).json({ error: true, message });
  }
});

app.listen(PORT, () => console.log('CancionOva backend running on port', PORT));
