require('dotenv').config();

const groqKey = process.env.GROQ_API_KEY;

console.log('🔍 Verificando Groq API Key...\n');
console.log(`📝 Key detectada: ${groqKey ? groqKey.substring(0, 10) + '...' : 'NO ENCONTRADA'}`);

if (!groqKey) {
  console.error('❌ GROQ_API_KEY no está definida en .env');
  process.exit(1);
}

const https = require('https');
const url = new URL('https://api.groq.com/openai/v1/models');

const options = {
  hostname: 'api.groq.com',
  path: '/openai/v1/models',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${groqKey}`,
    'User-Agent': 'Node.js Test'
  }
};

console.log('\n📤 Enviando petición a Groq API...\n');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📊 Status: ${res.statusCode}`);
    
    if (res.statusCode === 200) {
      console.log('✅ ¡LA API KEY FUNCIONA CORRECTAMENTE!');
      try {
        const json = JSON.parse(data);
        if (json.data && json.data.length > 0) {
          console.log(`\n📋 Modelos disponibles: ${json.data.length}`);
          console.log(`   Ejemplos: ${json.data.slice(0, 3).map(m => m.id).join(', ')}`);
        }
      } catch (e) {
        console.log('Respuesta recibida (datos de modelo)', data.substring(0, 100) + '...');
      }
    } else if (res.statusCode === 401) {
      console.log('❌ ERROR 401: La API key es inválida o ha expirado');
      console.log('   - Verifica que la key sea correcta en .env');
      console.log('   - Puede estar expirada');
      console.log('   - Verifica en https://console.groq.com/keys');
    } else if (res.statusCode === 429) {
      console.log('⚠️  ERROR 429: Rate limit excedido');
    } else {
      console.log(`❌ ERROR: ${res.statusCode}`);
      console.log(`Respuesta: ${data.substring(0, 200)}`);
    }
    process.exit(res.statusCode === 200 ? 0 : 1);
  });
});

req.on('error', (error) => {
  console.error('❌ Error de conexión:', error.message);
  process.exit(1);
});

req.end();
