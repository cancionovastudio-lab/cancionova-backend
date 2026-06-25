require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Client, Environment } = require('square');
const fetch   = require('node-fetch');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// Square client - Production
const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'CancionOva backend running', ok: true });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// POST /api/payment
app.post('/api/payment', async (req, res) => {
  const {
    sourceId,
    amountCents,
    currency,
    package: pkg,
    nombre, apellido, whatsapp, email,
    para, nombres, ocasion, voz, estilo1, estilo2, historia
  } = req.body;

  // Validation
  if (!sourceId || !amountCents || !currency) {
    return res.status(400).json({ error: true, message: 'Faltan datos del pago' });
  }

  const amount = Number(amountCents);
  if (![3000, 5000].includes(amount)) {
    return res.status(400).json({ error: true, message: 'Monto invalido' });
  }

  try {
    // Charge card via Square
    const { result } = await client.paymentsApi.createPayment({
      sourceId:       sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount:   BigInt(amount),
        currency: 'USD',
      },
      note: 'CancionOva - ' + (pkg === 'premium' ? 'Paquete Premium' : 'Paquete Basico') + ' - ' + nombre + ' ' + apellido,
      buyerEmailAddress: email,
    });

    const payment = result.payment;
    console.log('[PAYMENT OK] ID:', payment.id, '| $' + amount / 100, '|', nombre, apellido);

    // Send email via Formspree
    try {
      const fsPayload = {
        _subject:            'Nueva orden CancionOva - ' + (pkg === 'premium' ? 'PREMIUM $50' : 'BASICO $30'),
        'Estado':            'PAGADO - Cobro exitoso',
        'Square Payment ID': payment.id,
        'Paquete':           pkg === 'premium' ? 'Premium - $50' : 'Basico - $30',
        'Monto':             '$' + amount / 100 + ' USD',
        'Nombre':            nombre + ' ' + apellido,
        'WhatsApp':          whatsapp,
        'Email':             email,
        'Para quien':        para,
        'Nombres':           nombres,
        'Ocasion':           ocasion,
        'Voz':               voz,
        'Estilo 1':          estilo1,
        'Estilo 2':          estilo2,
        'Historia':          historia,
      };

      const fsRes = await fetch('https://formspree.io/f/xkoljybv', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(fsPayload),
      });

      if (fsRes.ok) {
        console.log('[FORMSPREE OK] Email sent');
      } else {
        console.warn('[FORMSPREE WARNING] Could not send email');
      }
    } catch (fsErr) {
      console.warn('[FORMSPREE ERROR]', fsErr.message);
    }

    return res.status(200).json({
      ok:        true,
      paymentId: payment.id,
      status:    payment.status,
      message:   'Pago procesado exitosamente',
    });

  } catch (error) {
    console.error('[PAYMENT ERROR]', error.message || error);

    // Friendly error messages
    let message = 'Error procesando el pago. Verifica los datos de tu tarjeta.';

    if (error.errors) {
      const codes = error.errors.map(function(e) { return e.code; });
      if (codes.includes('CARD_DECLINED'))          message = 'Tarjeta declinada. Intenta con otra tarjeta.';
      if (codes.includes('INSUFFICIENT_FUNDS'))     message = 'Fondos insuficientes en la tarjeta.';
      if (codes.includes('INVALID_CARD'))           message = 'Tarjeta invalida. Verifica los datos.';
      if (codes.includes('CARD_EXPIRED'))           message = 'La tarjeta esta vencida.';
      if (codes.includes('CVV_FAILURE'))            message = 'CVV incorrecto.';
    }

    return res.status(402).json({ error: true, message: message });
  }
});

app.listen(PORT, () => {
  console.log('CancionOva backend running on port', PORT);
});
