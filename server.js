require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { Client, Environment, ApiError } = require('squareup');
const fetch      = require('node-fetch');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Square client ────────────────────────────────────────────
const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

const paymentsApi = squareClient.paymentsApi;

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));
app.use(express.json());

// ── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'CancionOva backend running', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// ── POST /api/payment ─────────────────────────────────────────
app.post('/api/payment', async (req, res) => {
  const {
    sourceId,     // Square payment token from frontend
    amountCents,  // 3000 or 5000
    currency,     // USD
    package: pkg,
    nombre, apellido, whatsapp, email,
    para, nombres, ocasion, voz, estilo1, estilo2, historia
  } = req.body;

  // Basic validation
  if (!sourceId || !amountCents || !currency) {
    return res.status(400).json({ error: true, message: 'Faltan datos del pago' });
  }

  if (![3000, 5000].includes(Number(amountCents))) {
    return res.status(400).json({ error: true, message: 'Monto invalido' });
  }

  // Unique idempotency key to prevent duplicate charges
  const idempotencyKey = crypto.randomUUID();

  try {
    // ── 1. Charge the card via Square ────────────────────────
    const { result } = await paymentsApi.createPayment({
      sourceId:       sourceId,
      idempotencyKey: idempotencyKey,
      amountMoney: {
        amount:   BigInt(amountCents),
        currency: currency || 'USD',
      },
      note: `CancionOva - ${pkg === 'premium' ? 'Paquete Premium' : 'Paquete Basico'} - ${nombre} ${apellido}`,
      buyerEmailAddress: email,
    });

    const payment = result.payment;
    console.log(`[PAYMENT OK] ID: ${payment.id} | $${amountCents / 100} | ${nombre} ${apellido}`);

    // ── 2. Send form data to Formspree ────────────────────────
    try {
      const formPayload = {
        _subject:           `Nueva orden CancionOva - ${pkg === 'premium' ? 'PREMIUM $50' : 'BASICO $30'}`,
        'Estado del pago':  'PAGADO - Cobro exitoso en Square',
        'Square Payment ID': payment.id,
        'Paquete':          pkg === 'premium' ? 'Premium - $50' : 'Basico - $30',
        'Monto cobrado':    `$${amountCents / 100} USD`,
        'Nombre':           `${nombre} ${apellido}`,
        'WhatsApp':         whatsapp,
        'Email':            email,
        'Para quien':       para,
        'Nombres cancion':  nombres,
        'Ocasion':          ocasion,
        'Genero de voz':    voz,
        'Estilo 1':         estilo1,
        'Estilo 2':         estilo2,
        'Historia':         historia,
      };

      const fsRes = await fetch('https://formspree.io/f/xkoljybv', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(formPayload),
      });

      if (!fsRes.ok) {
        console.warn('[FORMSPREE WARNING] Could not send email notification');
      } else {
        console.log('[FORMSPREE OK] Email notification sent');
      }
    } catch (formErr) {
      // Formspree failure is non-critical — payment already went through
      console.warn('[FORMSPREE WARNING]', formErr.message);
    }

    // ── 3. Respond success to frontend ───────────────────────
    return res.status(200).json({
      ok:        true,
      paymentId: payment.id,
      status:    payment.status,
      amount:    amountCents,
      message:   'Pago procesado exitosamente',
    });

  } catch (error) {
    // Square API error
    if (error instanceof ApiError) {
      const errors = error.errors || [];
      const msg    = errors.map(e => e.detail || e.code).join(', ');
      console.error(`[PAYMENT ERROR] ${msg}`);

      // Friendly messages for common errors
      let friendly = 'Error procesando el pago. Verifica los datos de tu tarjeta.';
      if (errors.some(e => e.code === 'CARD_DECLINED'))          friendly = 'Tarjeta declinada. Intenta con otra tarjeta.';
      if (errors.some(e => e.code === 'INSUFFICIENT_FUNDS'))     friendly = 'Fondos insuficientes en la tarjeta.';
      if (errors.some(e => e.code === 'INVALID_CARD'))           friendly = 'Tarjeta invalida. Verifica los datos.';
      if (errors.some(e => e.code === 'CARD_EXPIRED'))           friendly = 'La tarjeta esta vencida.';
      if (errors.some(e => e.code === 'CVV_FAILURE'))            friendly = 'CVV incorrecto.';
      if (errors.some(e => e.code === 'ADDRESS_VERIFICATION_FAILURE')) friendly = 'Error de verificacion de direccion.';

      return res.status(402).json({ error: true, message: friendly, details: msg });
    }

    console.error('[UNEXPECTED ERROR]', error.message);
    return res.status(500).json({ error: true, message: 'Error interno del servidor. Intenta de nuevo.' });
  }
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`CancionOva backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`Square: Production mode`);
});
